import { CAUR_PKG_LIST_URL, type PkgListRetObject } from "@./shared-lib"
import { Injectable, Logger } from "@nestjs/common"
import { Axios } from "axios"

@Injectable()
export class MiscService {
    constructor() {
        Logger.log("MiscService initialized", "MiscService")
    }

    /**
     * Return the list of packages from Chaotic-AUR, mainly just for CORS proxying and caching.
     * @returns The list of packages from the specified package list.
     */
    async getPkgList(): Promise<PkgListRetObject> {
        const axios = new Axios({
            baseURL: "",
            timeout: 10000,
        })
        return axios.get(CAUR_PKG_LIST_URL).then((response): PkgListRetObject => {
            return { pkglist: response.data }
        })
    }
}
