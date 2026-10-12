import {
  renderEnvCompose,
  builtServices,
  builtImageName,
  withTag,
  parseComposePs,
  evaluateHealth,
} from "../env-compose";

const opts = (over: Partial<Parameters<typeof renderEnvCompose>[1]> = {}) => ({
  env: "dev",
  portOffset: 10000,
  isTracked: () => false,
  isFile: () => false,
  ...over,
});

describe("renderEnvCompose", () => {
  it("suffixes container names and drops the top-level name", () => {
    const { doc, changes } = renderEnvCompose(
      { name: "app", services: { web: { container_name: "app-web" } } },
      opts(),
    );
    expect(doc.name).toBeUndefined();
    expect(doc.services.web.container_name).toBe("app-web-dev");
    expect(changes.length).toBe(2);
  });

  it("does not mutate the source document", () => {
    const src = { services: { web: { container_name: "w", ports: ["80:80"] } } };
    renderEnvCompose(src, opts());
    expect(src.services.web.container_name).toBe("w");
    expect(src.services.web.ports[0]).toBe("80:80");
  });

  it("shifts short-syntax host ports, keeping IP and protocol", () => {
    const { doc, hostPorts } = renderEnvCompose(
      {
        services: {
          web: { ports: ["5001:5001", "127.0.0.1:8080:80/tcp", "3000", "9000-9001:9000-9001"] },
        },
      },
      opts(),
    );
    expect(doc.services.web.ports).toEqual([
      "15001:5001",
      "127.0.0.1:18080:80/tcp",
      "3000",
      "19000-19001:9000-9001",
    ]);
    expect(hostPorts.map((p) => p.host)).toEqual(["15001", "18080", "random", "19000-19001"]);
  });

  it("shifts long-syntax published ports", () => {
    const { doc } = renderEnvCompose(
      { services: { web: { ports: [{ target: 80, published: 8080 }, { target: 81, published: "8081" }] } } },
      opts({ portOffset: 20000 }),
    );
    expect(doc.services.web.ports).toEqual([
      { target: 80, published: 28080 },
      { target: 81, published: 28081 },
    ]);
  });

  it("leaves variable ports alone and warns", () => {
    const { doc, warnings } = renderEnvCompose(
      { services: { web: { ports: ["${PORT:-80}:80", "8080:${APP_PORT:-80}"] } } },
      opts(),
    );
    expect(doc.services.web.ports).toEqual(["${PORT:-80}:80", "18080:${APP_PORT:-80}"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/variable/);
  });

  it("fails when a shifted port leaves the valid range", () => {
    expect(() =>
      renderEnvCompose({ services: { web: { ports: ["60000:80"] } } }, opts()),
    ).toThrow(/ACM_PORT_OFFSET/);
  });

  it("isolates writable untracked data dirs but shares code, files and read-only mounts", () => {
    const { doc, changes } = renderEnvCompose(
      {
        services: {
          web: {
            volumes: [
              "./data:/app/data",
              "./src:/app/src",
              "./config.json:/app/config.json",
              "./certs:/certs:ro",
              "named:/var/lib",
              "/abs:/abs",
              { type: "bind", source: "./uploads", target: "/up" },
            ],
          },
        },
      },
      opts({ isTracked: (p) => p === "src", isFile: (p) => p === "config.json" }),
    );
    expect(doc.services.web.volumes).toEqual([
      "./.acm-env/dev/data:/app/data",
      "./src:/app/src",
      "./config.json:/app/config.json",
      "./certs:/certs:ro",
      "named:/var/lib",
      "/abs:/abs",
      { type: "bind", source: "./.acm-env/dev/uploads", target: "/up" },
    ]);
    expect(changes.filter((c) => c.includes("data dir"))).toHaveLength(2);
  });

  it("warns about mounts outside the project and shared named volumes", () => {
    const { warnings } = renderEnvCompose(
      {
        services: { web: { volumes: ["../shared:/s"] } },
        volumes: { ext: { external: true }, fixed: { name: "global" }, local: {} },
      },
      opts(),
    );
    expect(warnings).toHaveLength(3);
  });

  it("drops image: on services that build so envs never share a tag", () => {
    const { doc } = renderEnvCompose(
      { services: { api: { build: ".", image: "me/api:latest" }, db: { image: "mongo:6" } } },
      opts(),
    );
    expect(doc.services.api.image).toBeUndefined();
    expect(doc.services.db.image).toBe("mongo:6");
  });
});

describe("image helpers", () => {
  const doc = { services: { api: { build: "." }, web: { build: ".", image: "me/web:1" }, db: { image: "mongo" } } };

  it("lists built services and their image names", () => {
    expect(builtServices(doc)).toEqual(["api", "web"]);
    expect(builtImageName(doc, "shop-dev", "api")).toBe("shop-dev-api");
    expect(builtImageName(doc, "shop", "web")).toBe("me/web:1");
  });

  it("replaces tags without touching registry ports", () => {
    expect(withTag("shop-api", "rollback")).toBe("shop-api:rollback");
    expect(withTag("me/web:1", "rollback")).toBe("me/web:rollback");
    expect(withTag("reg:5000/app", "x")).toBe("reg:5000/app:x");
    expect(withTag("reg:5000/app:2", "x")).toBe("reg:5000/app:x");
  });
});

describe("health evaluation", () => {
  it("parses both compose ps output formats", () => {
    const a = parseComposePs('[{"Service":"a","State":"running"}]');
    const b = parseComposePs('{"Service":"a","State":"running"}\n{"Service":"b","State":"exited","ExitCode":0}\n');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
    expect(parseComposePs("")).toEqual([]);
  });

  it("is healthy when all services run and one-shot jobs exited cleanly", () => {
    expect(
      evaluateHealth(
        [
          { Service: "web", State: "running", Health: "healthy" },
          { Service: "migrate", State: "exited", ExitCode: 0 },
        ],
        ["web", "migrate"],
      ).verdict,
    ).toBe("healthy");
  });

  it("is pending while starting or missing", () => {
    expect(evaluateHealth([{ Service: "web", State: "running", Health: "starting" }], ["web"]).verdict).toBe("pending");
    expect(evaluateHealth([{ Service: "web", State: "running" }], ["web", "db"]).verdict).toBe("pending");
  });

  it("fails on crashes and unhealthy containers", () => {
    expect(evaluateHealth([{ Service: "web", State: "exited", ExitCode: 1 }], ["web"]).verdict).toBe("failed");
    expect(evaluateHealth([{ Service: "web", State: "running", Health: "unhealthy" }], ["web"]).verdict).toBe("failed");
  });
});

describe("project naming and build variables", () => {
  const { defaultComposeProjectName, buildVariableRefs } = require("../env-compose");

  it("follows Compose's own default project name rules", () => {
    expect(defaultComposeProjectName({}, "/data/projects/My.App/docker-compose.yml")).toBe("myapp");
    expect(defaultComposeProjectName({ name: "Fixed" }, "/x/y.yml")).toBe("fixed");
    expect(defaultComposeProjectName({}, "/x/y.yml", { COMPOSE_PROJECT_NAME: "env" })).toBe("env");
  });

  it("finds variables baked into images at build time", () => {
    const doc = {
      services: {
        web: {
          build: { context: ".", args: { VITE_API_URL: "${API_URL}", NODE_ENV: "production", TOKEN: null } },
        },
        api: { build: { context: ".", args: ["SENTRY_DSN", "MODE=prod"] } },
        db: { image: "mongo" },
      },
    };
    expect(buildVariableRefs(doc, "web")).toEqual(["API_URL", "TOKEN"]);
    expect(buildVariableRefs(doc, "api")).toEqual(["SENTRY_DSN"]);
    expect(buildVariableRefs(doc, "db")).toEqual([]);
  });
});
