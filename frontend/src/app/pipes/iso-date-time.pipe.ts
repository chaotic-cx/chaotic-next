import { Pipe, PipeTransform } from '@angular/core';

/**
 * Machine-readable ISO 8601 value for the `datetime` attribute of `<time>`.
 */
@Pipe({ name: 'isoDateTime' })
export class IsoDateTimePipe implements PipeTransform {
  transform(value: string | Date | number | null | undefined): string | null {
    if (value == null) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }
}
