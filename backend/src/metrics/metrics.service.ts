import { CACHE_ROUTER_TTL, CAUR_METRICS_URL, type SpecificPackageMetrics } from "@./shared-lib"
import { type Cache, CACHE_MANAGER } from "@nestjs/cache-manager"
import { Inject, Injectable, Logger } from "@nestjs/common"
import { Axios } from "axios"
import { parseOutput } from "../functions"

@Injectable()
export class MetricsService {
    axios: Axios

    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
        this.axios = new Axios({
            baseURL: CAUR_METRICS_URL,
            timeout: 10000,
        })

        Logger.log("MetricsService initialized", "MetricsService")
    }

    /**
     * Get the 30d user count from Chaotic-AUR router
     * @returns The 30d user count from Chaotic-AUR router
     */
    async thirtyDayUsers() {
        Logger.debug("thirtyDayUsers requested", "MetricsService")

        const cacheKey = "thirtyDayUsers"
        let data = await this.cacheManager.get(cacheKey)
        if (!data) {
            data = await this.axios
                .get(`30d/users`)
                .then((response) => {
                    return response.data
                })
                .catch((err) => {
                    console.error(err)
                    return []
                })
            await this.cacheManager.set(cacheKey, data, CACHE_ROUTER_TTL)
        }
        return data
    }

    /**
     * Get the 30d user agents list from Chaotic-AUR router
     * @returns The 30d user agents list from Chaotic-AUR router
     */
    async thirtyDayUserAgents() {
        Logger.debug("thirtyDayUsersAgents requested", "MetricsService")

        const cacheKey = "thirtyDayUserAgents"
        let data = await this.cacheManager.get(cacheKey)
        if (!data) {
            data = await this.axios
                .get(`30d/user-agents`)
                .then((response) => {
                    return parseOutput(response.data)
                })
                .catch((err) => {
                    console.error(err)
                    return []
                })
            await this.cacheManager.set(cacheKey, data, CACHE_ROUTER_TTL)
        }
        return data
    }

    /**
     * Get the metrics of a specific package from Chaotic-AUR router
     * @param param The name of the package to get the metrics
     * @returns The metrics of the specific package from Chaotic-AUR router
     */
    async thirtyDayPackage(param: any) {
        Logger.debug("thirtyDayPackage requested", "MetricsService")

        const cacheKey = `thirtyDayPackage-${param}`
        let data = await this.cacheManager.get(cacheKey)
        if (!data) {
            const metrics: SpecificPackageMetrics = { downloads: 0, user_agents: [] }
            metrics.name = param
            data = await Promise.all([
                this.axios.get(`30d/package/${metrics.name}`),
                this.axios.get(`30d/package/${metrics.name}/user-agents`),
            ])
                .then((allMetrics) => {
                    metrics.downloads = allMetrics[0].data
                    metrics.user_agents = parseOutput(allMetrics[1].data)
                    return metrics
                })
                .catch((err) => {
                    console.error(err)
                    return metrics
                })
            await this.cacheManager.set(cacheKey, data, CACHE_ROUTER_TTL)
        }
        return data
    }

    /**
     * Get the rank of packages from Chaotic-AUR router
     * @param range The range of the rank, valid are numbers form 1-50
     * @returns The rank of countries from Chaotic-AUR router
     */
    async rankCountries(range: any) {
        Logger.debug("rankCountries requested", "MetricsService")

        const cacheKey = `rankCountries-${range}`
        let data = await this.cacheManager.get(cacheKey)
        if (!data) {
            data = await this.axios
                .get(`30d/rank/${range}/countries`)
                .then((response) => {
                    return parseOutput(response.data)
                })
                .catch((err) => {
                    console.error(err)
                    return []
                })
            await this.cacheManager.set(cacheKey, data, CACHE_ROUTER_TTL)
        }
        return data
    }

    /**
     * Get the rank of packages from Chaotic-AUR router
     * @param range The range of the rank, valid are numbers form 1-50
     * @returns The rank of packages from Chaotic-AUR router
     */
    async rankPackages(range: any) {
        Logger.debug("rankCountries requested", "MetricsService")

        const cacheKey = `rankPackages-${range}`
        let data = await this.cacheManager.get(cacheKey)
        await this.cacheManager.reset()
        if (!data) {
            data = await this.axios
                .get(`30d/rank/${range}/packages`)
                .then((response) => {
                    return parseOutput(response.data)
                })
                .catch((err) => {
                    console.error(err)
                    return []
                })
            await this.cacheManager.set(cacheKey, data, CACHE_ROUTER_TTL)
        }
        return data
    }
}
