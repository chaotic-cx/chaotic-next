import { Pipe, PipeTransform } from "@angular/core"

@Pipe({
    name: "buildClass",
    standalone: true,
})
export class BuildClassPipe implements PipeTransform {
    transform(value: unknown): unknown {
        switch (value) {
            case 0:
                return "0 (light)"
            case 1:
                return "1 (medium)"
            case 2:
                return "2 (heavy)"
            default:
                return value
        }
    }
}
