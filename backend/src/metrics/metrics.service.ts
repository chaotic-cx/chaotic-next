import { CACHE_ROUTER_TTL, CAUR_METRICS_URL, parseOutput, SpecificPackageMetrics } from "@./shared-lib"
import { Cache, CACHE_MANAGER } from "@nestjs/cache-manager"
import { Inject, Injectable } from "@nestjs/common"
import { Axios } from "axios"

@Injectable()
export class MetricsService {
    axios: Axios

    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
        this.axios = new Axios({
            baseURL: CAUR_METRICS_URL,
            timeout: 100000,
        })
    }

    /**
     * Get the 30d user count from Chaotic-AUR router
     * @returns The 30d user count from Chaotic-AUR router
     */
    async thirtyDayUsers() {
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
