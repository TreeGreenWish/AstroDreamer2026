// JavaScript parses bare YYYY-MM-DD strings as UTC midnight. In time zones west of UTC,
// formatting that Date locally can display the previous calendar day. AstraDream stores dream
// dates and birth dates as date-only values, so they must retain their literal calendar date.
//
// This compatibility shim only changes the one-argument Date constructor for strict date-only
// strings. Timestamps (including note timestamps and astrology instants), Date.now/parse/UTC,
// numeric constructors, and multi-argument constructors keep native behavior.

const NativeDate = globalThis.Date;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

class LocalDateOnlyDate extends NativeDate {
  constructor(...args: any[]) {
    if (args.length === 1 && typeof args[0] === 'string') {
      const match = DATE_ONLY.exec(args[0]);
      if (match) {
        super(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return;
      }
    }
    // @ts-expect-error Date has overloaded constructor signatures; forwarding preserves native behavior.
    super(...args);
  }
}

Object.setPrototypeOf(LocalDateOnlyDate, NativeDate);
globalThis.Date = LocalDateOnlyDate as DateConstructor;
