/** Assertions about business markup do not depend on the table's row/column bookkeeping attributes. */
export const businessMarkup = (html: string): string => html.replace(/\sdata-table-[\w-]+="[^"]*"/g, '');
