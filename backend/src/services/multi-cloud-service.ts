import { Logger } from "../utils/logger";
import {
  EC2Client,
  DescribeInstancesCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { fromEnv } from "@aws-sdk/credential-provider-env";
import { InstancesClient } from "@google-cloud/compute";
import { DefaultAzureCredential } from "@azure/identity";
import { ComputeManagementClient } from "@azure/arm-compute";

export interface CloudProvider {
  name: string;
  type: "aws" | "gcp" | "azure";
  region: string;
  credentials: CloudCredentials;
  status: "connected" | "disconnected" | "error";
  lastSync?: string;
}

export interface CloudCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  projectId?: string;
  keyFile?: string;
  subscriptionId?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  resourceGroup?: string;
}

export interface CloudInstance {
  id: string;
  name: string;
  provider: string;
  region: string;
  type: string;
  status: string;
  cpu: number;
  memory: number;
  storage: number;
  cost: number;
  tags: Record<string, string>;
  createdAt: string;
  publicIp?: string;
  privateIp?: string;
}

export interface CloudMetrics {
  provider: string;
  region: string;
  timestamp: string;
  instances: number;
  totalCpu: number;
  totalMemory: number;
  totalStorage: number;
  totalCost: number;
  utilization: {
    cpu: number;
    memory: number;
    network: number;
  };
}

export interface MultiCloudConfig {
  providers: CloudProvider[];
  autoSync: boolean;
  syncInterval: number; // minutes
  costOptimization: boolean;
  securityCompliance: boolean;
}

export class MultiCloudService {
  private logger: Logger;
  private config: MultiCloudConfig;
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private metrics: CloudMetrics[] = [];

  constructor(logger: Logger) {
    this.logger = logger;
    this.config = {
      providers: [],
      autoSync: false,
      syncInterval: 5,
      costOptimization: true,
      securityCompliance: true,
    };
  }

  public getConfig(): MultiCloudConfig {
    return this.config;
  }

  public updateConfig(config: Partial<MultiCloudConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public async addProvider(provider: Omit<CloudProvider, "status">): Promise<CloudProvider> {
    try {
      this.logger.info(`Adding cloud provider: ${provider.name}`);

      const credentials = this.resolveCredentials(provider.type, provider.credentials);
      const isValid = await this.validateCredentials(provider.type, credentials, provider.region);
      if (!isValid) {
        throw new Error(`Invalid credentials for ${provider.type}`);
      }

      const newProvider: CloudProvider = {
        ...provider,
        credentials,
        status: "connected",
        lastSync: new Date().toISOString(),
      };

      this.config.providers.push(newProvider);

      if (this.config.autoSync) {
        this.startAutoSync(newProvider);
      }

      this.logger.info(`Successfully added cloud provider: ${provider.name}`);
      return newProvider;
    } catch (error) {
      this.logger.error(`Error adding cloud provider ${provider.name}:`, error);
      throw error;
    }
  }

  public async removeProvider(providerId: string): Promise<boolean> {
    try {
      this.logger.info(`Removing cloud provider: ${providerId}`);

      const index = this.config.providers.findIndex((p) => p.name === providerId);
      if (index === -1) {
        throw new Error("Provider not found");
      }

      this.stopAutoSync(providerId);
      this.config.providers.splice(index, 1);

      this.logger.info(`Successfully removed cloud provider: ${providerId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error removing cloud provider ${providerId}:`, error);
      return false;
    }
  }

  public async getProviders(): Promise<CloudProvider[]> {
    return this.config.providers;
  }

  public async getInstances(provider?: string): Promise<CloudInstance[]> {
    try {
      const instances: CloudInstance[] = [];
      const providersToQuery = provider
        ? this.config.providers.filter((p) => p.name === provider)
        : this.config.providers;

      for (const cloudProvider of providersToQuery) {
        const providerInstances = await this.fetchInstances(cloudProvider);
        instances.push(...providerInstances);
      }

      return instances;
    } catch (error) {
      this.logger.error("Error fetching cloud instances:", error);
      throw error;
    }
  }

  public async getMetrics(provider?: string): Promise<CloudMetrics[]> {
    try {
      const metrics: CloudMetrics[] = [];
      const providersToQuery = provider
        ? this.config.providers.filter((p) => p.name === provider)
        : this.config.providers;

      for (const cloudProvider of providersToQuery) {
        const providerMetrics = await this.fetchMetrics(cloudProvider);
        metrics.push(providerMetrics);
      }

      return metrics;
    } catch (error) {
      this.logger.error("Error fetching cloud metrics:", error);
      throw error;
    }
  }

  public async optimizeCosts(): Promise<{
    recommendations: Array<{
      provider: string;
      instanceId: string;
      recommendation: string;
      potentialSavings: number;
    }>;
    totalSavings: number;
  }> {
    try {
      this.logger.info("Starting cost optimization analysis...");

      const instances = await this.getInstances();
      const recommendations = [];
      let totalSavings = 0;

      for (const instance of instances) {
        const instanceRecommendations = await this.analyzeInstanceCost(instance);
        recommendations.push(...instanceRecommendations);
        totalSavings += instanceRecommendations.reduce((sum, rec) => sum + rec.potentialSavings, 0);
      }

      return { recommendations, totalSavings };
    } catch (error) {
      this.logger.error("Error optimizing costs:", error);
      throw error;
    }
  }

  public async deployInstance(config: {
    provider: string;
    name: string;
    type: string;
    region: string;
    image: string;
    ports?: number[];
    tags?: Record<string, string>;
  }): Promise<CloudInstance> {
    const provider = this.config.providers.find((p) => p.name === config.provider);
    if (!provider) {
      throw new Error("Provider not found");
    }

    return this.createInstance(provider, config);
  }

  public async terminateInstance(providerName: string, instanceId: string): Promise<boolean> {
    const provider = this.config.providers.find((p) => p.name === providerName);
    if (!provider) {
      throw new Error("Provider not found");
    }

    return this.deleteInstance(provider, instanceId);
  }

  private resolveCredentials(type: CloudProvider["type"], credentials: CloudCredentials): CloudCredentials {
    if (type === "aws") {
      return {
        accessKeyId: credentials.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: credentials.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: credentials.sessionToken || process.env.AWS_SESSION_TOKEN,
      };
    }

    if (type === "gcp") {
      return {
        projectId: credentials.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID,
        keyFile: credentials.keyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS,
      };
    }

    return {
      subscriptionId: credentials.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID,
      tenantId: credentials.tenantId || process.env.AZURE_TENANT_ID,
      clientId: credentials.clientId || process.env.AZURE_CLIENT_ID,
      clientSecret: credentials.clientSecret || process.env.AZURE_CLIENT_SECRET,
      resourceGroup: credentials.resourceGroup || process.env.AZURE_RESOURCE_GROUP,
    };
  }

  private async validateCredentials(
    type: CloudProvider["type"],
    credentials: CloudCredentials,
    region: string,
  ): Promise<boolean> {
    try {
      if (type === "aws") {
        if (!credentials.accessKeyId || !credentials.secretAccessKey || !region) {
          return false;
        }
        const client = new EC2Client({
          region,
          credentials: fromEnv(),
        });
        await client.send(new DescribeInstancesCommand({ MaxResults: 1 }));
        return true;
      }

      if (type === "gcp") {
        return !!(credentials.projectId && credentials.keyFile);
      }

      if (type === "azure") {
        return !!(
          credentials.subscriptionId &&
          credentials.tenantId &&
          credentials.clientId &&
          credentials.clientSecret
        );
      }

      return false;
    } catch (error) {
      this.logger.error(`Error validating ${type} credentials:`, error);
      return false;
    }
  }

  private async fetchInstances(provider: CloudProvider): Promise<CloudInstance[]> {
    if (provider.type === "aws") {
      return this.fetchAwsInstances(provider);
    }
    if (provider.type === "gcp") {
      return this.fetchGcpInstances(provider);
    }
    return this.fetchAzureInstances(provider);
  }

  private async fetchAwsInstances(provider: CloudProvider): Promise<CloudInstance[]> {
    const client = new EC2Client({
      region: provider.region,
      credentials: fromEnv(),
    });

    const response = await client.send(new DescribeInstancesCommand({}));
    const instances: CloudInstance[] = [];

    (response.Reservations || []).forEach((reservation) => {
      (reservation.Instances || []).forEach((instance) => {
        const tags = (instance.Tags || []).reduce<Record<string, string>>((acc, tag) => {
          if (tag.Key) acc[tag.Key] = tag.Value || "";
          return acc;
        }, {});

        instances.push({
          id: instance.InstanceId || "",
          name: tags.Name || instance.InstanceId || "",
          provider: provider.name,
          region: provider.region,
          type: instance.InstanceType || "unknown",
          status: instance.State?.Name || "unknown",
          cpu: 0,
          memory: 0,
          storage: 0,
          cost: 0,
          tags,
          createdAt: instance.LaunchTime?.toISOString() || new Date().toISOString(),
          publicIp: instance.PublicIpAddress,
          privateIp: instance.PrivateIpAddress,
        });
      });
    });

    return instances;
  }

  private async fetchGcpInstances(provider: CloudProvider): Promise<CloudInstance[]> {
    const credentials = this.resolveCredentials("gcp", provider.credentials);
    if (!credentials.projectId || !credentials.keyFile) {
      throw new Error("Missing GCP credentials (GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_CLOUD_PROJECT)");
    }

    const client = new InstancesClient({ keyFilename: credentials.keyFile });
    const [aggregated] = await client.aggregatedList({ project: credentials.projectId });
    const instances: CloudInstance[] = [];

    for (const [zone, scopedList] of Object.entries(aggregated)) {
      const zoneName = zone.split("/").pop() || provider.region;
      const scopedInstances = (scopedList as any).instances || [];
      for (const instance of scopedInstances) {
        const tags = (instance.labels || {}) as Record<string, string>;
        instances.push({
          id: instance.id?.toString() || "",
          name: instance.name || "",
          provider: provider.name,
          region: zoneName,
          type: instance.machineType?.split("/").pop() || "unknown",
          status: instance.status || "unknown",
          cpu: 0,
          memory: 0,
          storage: 0,
          cost: 0,
          tags,
          createdAt: instance.creationTimestamp || new Date().toISOString(),
          publicIp: instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP,
          privateIp: instance.networkInterfaces?.[0]?.networkIP,
        });
      }
    }

    return instances;
  }

  private async fetchAzureInstances(provider: CloudProvider): Promise<CloudInstance[]> {
    const credentials = this.resolveCredentials("azure", provider.credentials);
    if (!credentials.subscriptionId) {
      throw new Error("Missing Azure subscription ID");
    }

    const client = new ComputeManagementClient(
      new DefaultAzureCredential(),
      credentials.subscriptionId,
    );

    const instances: CloudInstance[] = [];
    for await (const vm of client.virtualMachines.listAll()) {
      instances.push({
        id: vm.id || "",
        name: vm.name || "",
        provider: provider.name,
        region: vm.location || provider.region,
        type: vm.hardwareProfile?.vmSize || "unknown",
        status: vm.provisioningState || "unknown",
        cpu: 0,
        memory: 0,
        storage: 0,
        cost: 0,
        tags: (vm.tags || {}) as Record<string, string>,
        createdAt: vm.timeCreated?.toISOString() || new Date().toISOString(),
      });
    }

    return instances;
  }

  private async fetchMetrics(provider: CloudProvider): Promise<CloudMetrics> {
    const instances = await this.fetchInstances(provider);

    return {
      provider: provider.name,
      region: provider.region,
      timestamp: new Date().toISOString(),
      instances: instances.length,
      totalCpu: instances.reduce((sum, i) => sum + i.cpu, 0),
      totalMemory: instances.reduce((sum, i) => sum + i.memory, 0),
      totalStorage: instances.reduce((sum, i) => sum + i.storage, 0),
      totalCost: instances.reduce((sum, i) => sum + i.cost, 0),
      utilization: {
        cpu: 0,
        memory: 0,
        network: 0,
      },
    };
  }

  private async analyzeInstanceCost(instance: CloudInstance): Promise<Array<{
    provider: string;
    instanceId: string;
    recommendation: string;
    potentialSavings: number;
  }>> {
    const recommendations = [];

    if (instance.type.includes("large") && instance.cpu <= 1) {
      recommendations.push({
        provider: instance.provider,
        instanceId: instance.id,
        recommendation: `Downsize ${instance.name} from ${instance.type} to smaller instance type`,
        potentialSavings: instance.cost * 0.5,
      });
    }

    recommendations.push({
      provider: instance.provider,
      instanceId: instance.id,
      recommendation: `Convert ${instance.name} to reserved instance for better pricing`,
      potentialSavings: instance.cost * 0.3,
    });

    return recommendations;
  }

  private async createInstance(
    provider: CloudProvider,
    config: {
      name: string;
      type: string;
      region: string;
      image: string;
      ports?: number[];
      tags?: Record<string, string>;
    },
  ): Promise<CloudInstance> {
    if (provider.type === "aws") {
      const client = new EC2Client({
        region: config.region,
        credentials: fromEnv(),
      });

      const response = await client.send(
        new RunInstancesCommand({
          ImageId: config.image,
          InstanceType: config.type,
          MinCount: 1,
          MaxCount: 1,
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [{ Key: "Name", Value: config.name }],
            },
          ],
        }),
      );

      const instance = response.Instances?.[0];
      return {
        id: instance?.InstanceId || "",
        name: config.name,
        provider: provider.name,
        region: config.region,
        type: instance?.InstanceType || config.type,
        status: instance?.State?.Name || "pending",
        cpu: 0,
        memory: 0,
        storage: 0,
        cost: 0,
        tags: config.tags || {},
        createdAt: instance?.LaunchTime?.toISOString() || new Date().toISOString(),
        publicIp: instance?.PublicIpAddress,
        privateIp: instance?.PrivateIpAddress,
      };
    }

    if (provider.type === "gcp") {
      const credentials = this.resolveCredentials("gcp", provider.credentials);
      if (!credentials.projectId || !credentials.keyFile) {
        throw new Error("Missing GCP credentials (GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_CLOUD_PROJECT)");
      }
      const client = new InstancesClient({ keyFilename: credentials.keyFile });
      const zone = config.region;
      await client.insert({
        project: credentials.projectId,
        zone,
        instanceResource: {
          name: config.name,
          machineType: `zones/${zone}/machineTypes/${config.type}`,
          disks: [
            {
              boot: true,
              autoDelete: true,
              initializeParams: {
                sourceImage: config.image,
              },
            },
          ],
          networkInterfaces: [
            {
              name: "global/networks/default",
              accessConfigs: [{ name: "External NAT", type: "ONE_TO_ONE_NAT" }],
            },
          ],
          labels: config.tags || {},
        },
      });

      return {
        id: config.name,
        name: config.name,
        provider: provider.name,
        region: zone,
        type: config.type,
        status: "running",
        cpu: 0,
        memory: 0,
        storage: 0,
        cost: 0,
        tags: config.tags || {},
        createdAt: new Date().toISOString(),
      };
    }

    const credentials = this.resolveCredentials("azure", provider.credentials);
    if (!credentials.subscriptionId || !credentials.resourceGroup) {
      throw new Error("Missing Azure subscription/resource group");
    }
    const client = new ComputeManagementClient(
      new DefaultAzureCredential(),
      credentials.subscriptionId,
    );

    const imageParts = config.image.split(":");
    const imageRef = imageParts.length === 4
      ? {
          publisher: imageParts[0],
          offer: imageParts[1],
          sku: imageParts[2],
          version: imageParts[3],
        }
      : undefined;

    await client.virtualMachines.beginCreateOrUpdate(
      credentials.resourceGroup,
      config.name,
      {
        location: config.region,
        hardwareProfile: { vmSize: config.type },
        storageProfile: imageRef ? { imageReference: imageRef } : undefined,
        osProfile: {
          computerName: config.name,
          adminUsername: process.env.AZURE_ADMIN_USERNAME || "azureuser",
          adminPassword: process.env.AZURE_ADMIN_PASSWORD || "ChangeMe123!",
        },
        networkProfile: {
          networkInterfaces: [],
        },
        tags: config.tags,
      },
    );

    return {
      id: config.name,
      name: config.name,
      provider: provider.name,
      region: config.region,
      type: config.type,
      status: "running",
      cpu: 0,
      memory: 0,
      storage: 0,
      cost: 0,
      tags: config.tags || {},
      createdAt: new Date().toISOString(),
    };
  }

  private async deleteInstance(provider: CloudProvider, instanceId: string): Promise<boolean> {
    if (provider.type === "aws") {
      const client = new EC2Client({
        region: provider.region,
        credentials: fromEnv(),
      });
      await client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
      return true;
    }

    if (provider.type === "gcp") {
      const credentials = this.resolveCredentials("gcp", provider.credentials);
      if (!credentials.projectId || !credentials.keyFile) {
        throw new Error("Missing GCP credentials (GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_CLOUD_PROJECT)");
      }
      const client = new InstancesClient({ keyFilename: credentials.keyFile });
      const zone = provider.region;
      await client.delete({ project: credentials.projectId, zone, instance: instanceId });
      return true;
    }

    const credentials = this.resolveCredentials("azure", provider.credentials);
    if (!credentials.subscriptionId || !credentials.resourceGroup) {
      throw new Error("Missing Azure subscription/resource group");
    }
    const client = new ComputeManagementClient(
      new DefaultAzureCredential(),
      credentials.subscriptionId,
    );
    await client.virtualMachines.beginDelete(credentials.resourceGroup, instanceId);
    return true;
  }

  private startAutoSync(provider: CloudProvider): void {
    if (this.syncIntervals.has(provider.name)) {
      clearInterval(this.syncIntervals.get(provider.name)!);
    }

    const interval = setInterval(async () => {
      try {
        await this.syncProvider(provider);
      } catch (error) {
        this.logger.error(`Error syncing provider ${provider.name}:`, error);
      }
    }, this.config.syncInterval * 60 * 1000);

    this.syncIntervals.set(provider.name, interval);
  }

  private stopAutoSync(providerName: string): void {
    const interval = this.syncIntervals.get(providerName);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(providerName);
    }
  }

  private async syncProvider(provider: CloudProvider): Promise<void> {
    try {
      const metrics = await this.fetchMetrics(provider);
      this.metrics.push(metrics);

      if (this.metrics.length > 100) {
        this.metrics = this.metrics.slice(-100);
      }

      provider.lastSync = new Date().toISOString();
      provider.status = "connected";
    } catch (error) {
      provider.status = "error";
      throw error;
    }
  }

  public getMetricsHistory(): CloudMetrics[] {
    return this.metrics;
  }
}
