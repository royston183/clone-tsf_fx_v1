// Where the TRM pop-up (components/trm) reads a transaction a link opens: the first source here that matches it.
// Add an application's own sources in front of the NIIF one, which answers every company code and number
// (docs/how-to-add-an-application.md, "TRM transaction links").
import { niifTransactions } from '@/lib/trm/niif';
import type { TransactionSource } from '@/lib/trm/sources';

export const TRANSACTION_SOURCES: TransactionSource[] = [niifTransactions];
