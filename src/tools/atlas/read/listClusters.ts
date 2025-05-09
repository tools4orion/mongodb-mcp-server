import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AtlasToolBase } from "../atlasTool.js";
import { ToolArgs, OperationType } from "../../tool.js";
import { PaginatedClusterDescription20240805, PaginatedOrgGroupView, Group } from "../../../common/atlas/openapi.js";

export class ListClustersTool extends AtlasToolBase {
    protected name = "atlas-list-clusters";
    protected description = "List MongoDB Atlas clusters";
    protected operationType: OperationType = "read";
    protected argsShape = {
        projectId: z.string().describe("Atlas project ID to filter clusters").optional(),
    };

    protected async execute({ projectId }: ToolArgs<typeof this.argsShape>): Promise<CallToolResult> {
        if (!projectId) {
            const data = await this.session.apiClient.listClustersForAllProjects();

            return this.formatAllClustersTable(data);
        } else {
            const project = await this.session.apiClient.getProject({
                params: {
                    path: {
                        groupId: projectId,
                    },
                },
            });

            if (!project?.id) {
                throw new Error(`Project with ID "${projectId}" not found.`);
            }

            const data = await this.session.apiClient.listClusters({
                params: {
                    path: {
                        groupId: project.id || "",
                    },
                },
            });

            return this.formatClustersTable(project, data);
        }
    }

    private formatAllClustersTable(clusters?: PaginatedOrgGroupView): CallToolResult {
        if (!clusters?.results?.length) {
            throw new Error("No clusters found.");
        }
        const formattedClusters = clusters.results
            .map((result) => {
                return (result.clusters || []).map((cluster) => {
                    return { ...result, ...cluster, clusters: undefined };
                });
            })
            .flat();
        if (!formattedClusters.length) {
            throw new Error("No clusters found.");
        }
        const rows = formattedClusters
            .map((cluster) => {
                return `${cluster.groupName} (${cluster.groupId}) | ${cluster.name}`;
            })
            .join("\n");
        return {
            content: [
                {
                    type: "text",
                    text: `Project | Cluster Name
----------------|----------------
${rows}`,
                },
            ],
        };
    }

    private formatClustersTable(project: Group, clusters?: PaginatedClusterDescription20240805): CallToolResult {
        if (!clusters?.results?.length) {
            throw new Error("No clusters found.");
        }
        const rows = clusters.results
            .map((cluster) => {
                const connectionString =
                    cluster.connectionStrings?.standardSrv || cluster.connectionStrings?.standard || "N/A";
                const mongoDBVersion = cluster.mongoDBVersion || "N/A";
                const regionConfigs = (cluster.replicationSpecs || [])
                    .map(
                        (replicationSpec) =>
                            (replicationSpec.regionConfigs || []) as {
                                providerName: string;
                                electableSpecs?: {
                                    instanceSize: string;
                                };
                                readOnlySpecs?: {
                                    instanceSize: string;
                                };
                            }[]
                    )
                    .flat()
                    .map((regionConfig) => {
                        return {
                            providerName: regionConfig.providerName,
                            instanceSize:
                                regionConfig.electableSpecs?.instanceSize || regionConfig.readOnlySpecs?.instanceSize,
                        };
                    });

                const instanceSize =
                    (regionConfigs.length <= 0 ? undefined : regionConfigs[0].instanceSize) || "UNKNOWN";

                const clusterInstanceType = instanceSize == "M0" ? "FREE" : "DEDICATED";

                return `${cluster.name} | ${clusterInstanceType} | ${clusterInstanceType == "DEDICATED" ? instanceSize : "N/A"} | ${cluster.stateName} | ${mongoDBVersion} | ${connectionString}`;
            })
            .join("\n");
        return {
            content: [
                {
                    type: "text",
                    text: `Here are your MongoDB Atlas clusters in project "${project.name}" (${project.id}):`,
                },
                {
                    type: "text",
                    text: `Cluster Name | Cluster Type | Tier | State | MongoDB Version | Connection String
----------------|----------------|----------------|----------------|----------------|----------------
${rows}`,
                },
            ],
        };
    }
}
