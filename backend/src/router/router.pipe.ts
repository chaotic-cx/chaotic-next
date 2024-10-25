import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { isOfTypeRouterHitColumns } from "./router.entity";

@Injectable()
export class RouterHitColumPipe implements PipeTransform {
    transform(value: any) {
        if (!isOfTypeRouterHitColumns) throw new BadRequestException("Invalid request type");
        return value;
    }
}
