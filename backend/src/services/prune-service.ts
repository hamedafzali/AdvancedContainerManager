import { spawn } from "child_process";
import { Logger } from "../utils/logger";
import { SettingsService } from "./settings-service";

export class PruneService {
  private logger: Logger;
  private settingsService: SettingsService;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(logger: Logger, settingsService: SettingsService) {
    this.logger = logger;
    this.settingsService = settingsService;
  }

  public start(): void {
    this.scheduleNext();
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private scheduleNext(): void {
    const pruneIntervalMs = this.settingsService.getSectionValue<number>("docker", "pruneInterval") || 86400000;
    this.interval = setInterval(() => this.runIfEnabled(), pruneIntervalMs);
    this.logger.info(`Auto-prune scheduled every ${pruneIntervalMs / 3600000}h`);
  }

  private async runIfEnabled(): Promise<void> {
    const enabled = this.settingsService.getSectionValue<boolean>("docker", "autoPrune");
    if (!enabled) return;

    this.logger.info("Running scheduled auto-prune...");
    await this.pruneContainers();
    await this.pruneImages();
    await this.pruneVolumes();
  }

  private run(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const child = spawn("docker", args);
      let stdout = "", stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      child.on("error", () => resolve({ stdout, stderr, code: 1 }));
    });
  }

  public async pruneContainers(): Promise<string> {
    const result = await this.run(["container", "prune", "-f"]);
    const output = result.stdout || result.stderr || "Done";
    this.logger.info(`Pruned containers: ${output.trim()}`);
    return output;
  }

  public async pruneImages(): Promise<string> {
    const result = await this.run(["image", "prune", "-f"]);
    const output = result.stdout || result.stderr || "Done";
    this.logger.info(`Pruned images: ${output.trim()}`);
    return output;
  }

  public async pruneVolumes(): Promise<string> {
    const result = await this.run(["volume", "prune", "-f"]);
    const output = result.stdout || result.stderr || "Done";
    this.logger.info(`Pruned volumes: ${output.trim()}`);
    return output;
  }

  public async pruneAll(): Promise<{ containers: string; images: string; volumes: string }> {
    const [containers, images, volumes] = await Promise.all([
      this.pruneContainers(),
      this.pruneImages(),
      this.pruneVolumes(),
    ]);
    return { containers, images, volumes };
  }
}
