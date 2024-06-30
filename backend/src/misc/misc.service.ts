import { CAUR_PKG_LIST_URL, PkgListRetObject } from "@./shared-lib"
import { Injectable } from "@nestjs/common"
import { Axios } from "axios"

@Injectable()
export class MiscService {
    /**
     * Return the list of packages from Chaotic-AUR, mainly just for CORS proxying and caching.
     */
    async getPkgList(): Promise<PkgListRetObject> {
        const axios = new Axios({
            baseURL: "",
            timeout: 1000,
        })
        return axios.get(CAUR_PKG_LIST_URL).then((response): PkgListRetObject => {
            return { pkglist: response.data }
        })
    }
}
