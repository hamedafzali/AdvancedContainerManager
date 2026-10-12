import { findRelativeBindMounts, resolveHostPath } from "../host-paths";

describe("resolveHostPath", () => {
  const mounts = [
    { Type: "bind", Source: "/home/me/acm/data/projects", Destination: "/data/projects" },
    { Type: "bind", Source: "/home/me/acm/data/db", Destination: "/data/db" },
    { Type: "volume", Source: "/var/lib/docker/volumes/x", Destination: "/data" },
  ];

  it("maps a container path through the bind mount that holds it", () => {
    expect(resolveHostPath(mounts, "/data/projects")).toBe("/home/me/acm/data/projects");
    expect(resolveHostPath(mounts, "/data/projects/Portfolio")).toBe(
      "/home/me/acm/data/projects/Portfolio",
    );
  });

  it("returns null when the path is not on a bind mount", () => {
    expect(resolveHostPath(mounts, "/srv/other")).toBeNull();
    expect(resolveHostPath(mounts, "/data/projectsX")).toBeNull();
  });

  it("reports identity mounts unchanged", () => {
    const same = [{ Type: "bind", Source: "/data/projects/", Destination: "/data/projects" }];
    expect(resolveHostPath(same, "/data/projects/")).toBe("/data/projects");
  });
});

describe("findRelativeBindMounts", () => {
  it("finds short and long syntax relative sources only", () => {
    const compose = {
      services: {
        web: { volumes: ["./data:/app/data:ro", "named:/cache", "/etc/hosts:/etc/hosts"] },
        db: { volumes: [{ type: "bind", source: "../shared", target: "/s" }, { type: "volume", source: "db" }] },
        bare: {},
      },
    };
    expect(findRelativeBindMounts(compose)).toEqual(["web: ./data", "db: ../shared"]);
  });

  it("tolerates documents without services", () => {
    expect(findRelativeBindMounts(null)).toEqual([]);
    expect(findRelativeBindMounts({})).toEqual([]);
  });
});
