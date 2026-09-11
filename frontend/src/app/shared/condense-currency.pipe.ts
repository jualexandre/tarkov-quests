import { Pipe, PipeTransform } from "@angular/core";
import { condenseCurrency } from "../core/condense-currency";

@Pipe({ name: "condenseCurrency", standalone: true })
export class CondenseCurrencyPipe implements PipeTransform {
  transform(value: string): string {
    return condenseCurrency(value);
  }
}
