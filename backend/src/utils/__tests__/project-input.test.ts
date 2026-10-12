import { validateProjectName, validateRepoUrl, validateBranch, validateComposePath } from "../project-input";

describe("project input validation", () => {
  it("accepts normal project names and rejects path tricks", () => {
    for (const ok of ["Portfolio", "koodak-book", "app_1", "my.app"]) expect(validateProjectName(ok)).toBe(ok);
    for (const bad of ["", "../etc", "a/b", ".hidden", "-x", "a..b", "x".repeat(65), 5]) {
      expect(() => validateProjectName(bad)).toThrow();
    }
  });

  it("accepts remote git URLs only", () => {
    for (const ok of ["https://github.com/a/b.git", "ssh://git@host/a/b", "git@github.com:a/b.git"]) {
      expect(validateRepoUrl(ok)).toBe(ok);
    }
    for (const bad of ["/srv/repo", "file:///etc", "ext::sh -c id", "--upload-pack=x", "https://a b"]) {
      expect(() => validateRepoUrl(bad)).toThrow();
    }
  });

  it("rejects branch names git would treat as options or ranges", () => {
    for (const ok of ["main", "feature/x-1", "release-2.0"]) expect(validateBranch(ok)).toBe(ok);
    for (const bad of ["", "-x", "a..b", "a b", "x/", "x.lock"]) expect(() => validateBranch(bad)).toThrow();
  });

  it("keeps compose files inside the project", () => {
    expect(validateComposePath("/p/app", "docker-compose.yml")).toBe("docker-compose.yml");
    expect(validateComposePath("/p/app", "deploy/compose.yml")).toBe("deploy/compose.yml");
    for (const bad of ["../other/compose.yml", "/etc/compose.yml", ""]) {
      expect(() => validateComposePath("/p/app", bad)).toThrow();
    }
  });
});
