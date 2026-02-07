"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIOptimizer = void 0;
class AIOptimizer {
    constructor(dockerService, metricsCollector, logger) {
        this.optimizationHistory = [];
        this.learningData = new Map();
        this.dockerService = dockerService;
        this.metricsCollector = metricsCollector;
        this.logger = logger;
    }
    async performOptimizationAnalysis() {
        try {
            this.logger.info("Starting AI-powered optimization analysis...");
            const containers = await this.dockerService.getAllContainers();
            const systemMetrics = await this.metricsCollector.collectSystemMetrics();
            const recommendations = [];
            // Analyze each container for optimization opportunities
            for (const container of containers) {
                const containerMetrics = await this.dockerService.getContainerStats(container.id);
                const containerRecommendations = await this.analyzeContainer(container, containerMetrics, systemMetrics);
                recommendations.push(...containerRecommendations);
            }
            // Analyze system-wide optimization opportunities
            const systemRecommendations = await this.analyzeSystemOptimization(systemMetrics, containers);
            recommendations.push(...systemRecommendations);
            // Calculate overall optimization score and potential savings
            const result = {
                timestamp: new Date().toISOString(),
                recommendations: recommendations.sort((a, b) => {
                    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
                    return priorityOrder[b.priority] - priorityOrder[a.priority];
                }),
                overallScore: this.calculateOptimizationScore(recommendations),
                potentialSavings: this.calculatePotentialSavings(recommendations),
            };
            this.optimizationHistory.push(result);
            this.updateLearningData(result);
            this.logger.info(`AI optimization analysis completed. Score: ${result.overallScore}, Recommendations: ${recommendations.length}`);
            return result;
        }
        catch (error) {
            this.logger.error("Error in AI optimization analysis:", error);
            throw error;
        }
    }
    async analyzeContainer(container, metrics, systemMetrics) {
        const recommendations = [];
        // Resource optimization analysis
        const resourceRecs = this.analyzeResourceUsage(container, metrics);
        recommendations.push(...resourceRecs);
        // Performance optimization analysis
        const performanceRecs = this.analyzePerformance(container, metrics);
        recommendations.push(...performanceRecs);
        // Security optimization analysis
        const securityRecs = this.analyzeSecurity(container);
        recommendations.push(...securityRecs);
        // Cost optimization analysis
        const costRecs = this.analyzeCostOptimization(container, metrics);
        recommendations.push(...costRecs);
        return recommendations;
    }
    analyzeResourceUsage(container, metrics) {
        const recommendations = [];
        // CPU optimization
        if (metrics.cpuPercent > 80) {
            recommendations.push({
                type: "resource",
                priority: "high",
                containerId: container.id,
                title: "High CPU Usage Detected",
                description: `Container ${container.name} is using ${metrics.cpuPercent.toFixed(1)}% CPU`,
                recommendation: "Consider increasing CPU allocation or optimizing application code",
                expectedImpact: "Improved performance and stability",
                estimatedSavings: { cpu: metrics.cpuPercent - 70 },
            });
        }
        else if (metrics.cpuPercent < 10) {
            recommendations.push({
                type: "resource",
                priority: "medium",
                containerId: container.id,
                title: "Underutilized CPU Resources",
                description: `Container ${container.name} is using only ${metrics.cpuPercent.toFixed(1)}% CPU`,
                recommendation: "Consider reducing CPU allocation to save costs",
                expectedImpact: "Reduced resource costs",
                estimatedSavings: { cpu: 50 - metrics.cpuPercent, cost: 10 },
            });
        }
        // Memory optimization
        if (metrics.memoryPercent > 85) {
            recommendations.push({
                type: "resource",
                priority: "critical",
                containerId: container.id,
                title: "High Memory Usage Detected",
                description: `Container ${container.name} is using ${metrics.memoryPercent.toFixed(1)}% memory`,
                recommendation: "Increase memory allocation or investigate memory leaks",
                expectedImpact: "Prevent out-of-memory errors",
                estimatedSavings: { memory: metrics.memoryPercent - 75 },
            });
        }
        else if (metrics.memoryPercent < 20) {
            recommendations.push({
                type: "resource",
                priority: "medium",
                containerId: container.id,
                title: "Underutilized Memory Resources",
                description: `Container ${container.name} is using only ${metrics.memoryPercent.toFixed(1)}% memory`,
                recommendation: "Consider reducing memory allocation",
                expectedImpact: "Reduced memory costs",
                estimatedSavings: { memory: 40 - metrics.memoryPercent, cost: 15 },
            });
        }
        return recommendations;
    }
    analyzePerformance(container, metrics) {
        const recommendations = [];
        // Network I/O analysis
        if (metrics.networkRx > 1000000000 || metrics.networkTx > 1000000000) {
            // > 1GB
            recommendations.push({
                type: "performance",
                priority: "medium",
                containerId: container.id,
                title: "High Network I/O Detected",
                description: `Container ${container.name} has high network activity`,
                recommendation: "Consider network optimization or load balancing",
                expectedImpact: "Improved network performance",
            });
        }
        // Block I/O analysis
        if (metrics.blockRead > 100000000 || metrics.blockWrite > 100000000) {
            // > 100MB
            recommendations.push({
                type: "performance",
                priority: "medium",
                containerId: container.id,
                title: "High Disk I/O Detected",
                description: `Container ${container.name} has high disk activity`,
                recommendation: "Consider using faster storage or optimizing I/O operations",
                expectedImpact: "Improved disk performance",
            });
        }
        return recommendations;
    }
    analyzeSecurity(container) {
        const recommendations = [];
        // Check for exposed sensitive ports
        const sensitivePorts = [22, 23, 3389, 5432, 3306, 6379];
        const exposedPorts = Object.keys(container.ports).map((port) => parseInt(port));
        const exposedSensitivePorts = exposedPorts.filter((port) => sensitivePorts.includes(port));
        if (exposedSensitivePorts.length > 0) {
            recommendations.push({
                type: "security",
                priority: "high",
                containerId: container.id,
                title: "Sensitive Ports Exposed",
                description: `Container ${container.name} exposes sensitive ports: ${exposedSensitivePorts.join(", ")}`,
                recommendation: "Restrict access to sensitive ports or use internal networking",
                expectedImpact: "Improved security",
            });
        }
        // Check for security labels
        if (!container.labels["security.scan"] ||
            container.labels["security.scan"] !== "enabled") {
            recommendations.push({
                type: "security",
                priority: "medium",
                containerId: container.id,
                title: "Security Scanning Not Enabled",
                description: `Container ${container.name} does not have security scanning enabled`,
                recommendation: "Enable security scanning for vulnerability detection",
                expectedImpact: "Improved security posture",
            });
        }
        return recommendations;
    }
    analyzeCostOptimization(container, metrics) {
        const recommendations = [];
        // Calculate estimated monthly cost based on resource usage
        const estimatedMonthlyCost = this.calculateContainerCost(container, metrics);
        // Check if container is running but unused
        if (container.status === "running" &&
            metrics.cpuPercent < 5 &&
            metrics.memoryPercent < 10) {
            recommendations.push({
                type: "cost",
                priority: "medium",
                containerId: container.id,
                title: "Idle Container Cost Optimization",
                description: `Container ${container.name} appears to be idle but incurring costs`,
                recommendation: "Consider stopping idle containers or using auto-scaling",
                expectedImpact: "Significant cost savings",
                estimatedSavings: { cost: estimatedMonthlyCost * 0.8 },
            });
        }
        // Check for over-provisioned resources
        if (metrics.cpuPercent < 30 && metrics.memoryPercent < 40) {
            recommendations.push({
                type: "cost",
                priority: "low",
                containerId: container.id,
                title: "Over-provisioned Resources",
                description: `Container ${container.name} may have over-provisioned resources`,
                recommendation: "Right-size container resources based on actual usage",
                expectedImpact: "Reduced monthly costs",
                estimatedSavings: { cost: estimatedMonthlyCost * 0.3 },
            });
        }
        return recommendations;
    }
    async analyzeSystemOptimization(systemMetrics, containers) {
        const recommendations = [];
        // System-wide resource optimization
        if (systemMetrics.cpuPercent > 80) {
            recommendations.push({
                type: "resource",
                priority: "high",
                title: "High System CPU Usage",
                description: `System CPU usage is at ${systemMetrics.cpuPercent.toFixed(1)}%`,
                recommendation: "Consider scaling horizontally or optimizing workloads",
                expectedImpact: "Improved system performance",
            });
        }
        if (systemMetrics.memoryPercent > 85) {
            recommendations.push({
                type: "resource",
                priority: "critical",
                title: "High System Memory Usage",
                description: `System memory usage is at ${systemMetrics.memoryPercent.toFixed(1)}%`,
                recommendation: "Add more memory or optimize memory usage",
                expectedImpact: "Prevent system instability",
            });
        }
        // Container consolidation opportunities
        const runningContainers = containers.filter((c) => c.status === "running");
        if (runningContainers.length > 10) {
            recommendations.push({
                type: "cost",
                priority: "medium",
                title: "Container Consolidation Opportunity",
                description: `${runningContainers.length} containers are running simultaneously`,
                recommendation: "Consider consolidating smaller containers or using Kubernetes",
                expectedImpact: "Reduced overhead and costs",
                estimatedSavings: { cost: runningContainers.length * 5 },
            });
        }
        return recommendations;
    }
    calculateOptimizationScore(recommendations) {
        let score = 100;
        recommendations.forEach((rec) => {
            const penalty = {
                critical: 25,
                high: 15,
                medium: 8,
                low: 3,
            };
            score -= penalty[rec.priority];
        });
        return Math.max(0, score);
    }
    calculatePotentialSavings(recommendations) {
        const savings = { cpu: 0, memory: 0, cost: 0 };
        recommendations.forEach((rec) => {
            if (rec.estimatedSavings) {
                savings.cpu += rec.estimatedSavings.cpu || 0;
                savings.memory += rec.estimatedSavings.memory || 0;
                savings.cost += rec.estimatedSavings.cost || 0;
            }
        });
        return savings;
    }
    calculateContainerCost(container, metrics) {
        // Simplified cost calculation - in real implementation, this would use cloud provider pricing
        const cpuCost = ((container.resources.cpuShares || 1024) / 1024) * 10; // $10 per CPU unit per month
        const memoryCost = ((container.resources.memoryLimit || 1024) / 1024) * 5; // $5 per GB per month
        return cpuCost + memoryCost;
    }
    updateLearningData(result) {
        // Store optimization results for machine learning
        const key = new Date().toISOString().substring(0, 7); // YYYY-MM
        this.learningData.set(key, {
            score: result.overallScore,
            recommendations: result.recommendations.length,
            savings: result.potentialSavings,
        });
    }
    getOptimizationHistory() {
        return this.optimizationHistory;
    }
    getLearningData() {
        return this.learningData;
    }
    async applyOptimizationRecommendation(recommendationId) {
        try {
            // Implementation for automatically applying optimization recommendations
            this.logger.info(`Applying optimization recommendation: ${recommendationId}`);
            // This would integrate with container orchestration to apply optimizations
            // For now, return true to indicate successful application
            return true;
        }
        catch (error) {
            this.logger.error("Error applying optimization recommendation:", error);
            return false;
        }
    }
}
exports.AIOptimizer = AIOptimizer;
