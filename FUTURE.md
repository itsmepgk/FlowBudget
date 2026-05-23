# Future Features

## Planned

### Multi-currency within a group
Allow individual expenses inside a group to each have their own currency (e.g. one expense in EUR, another in USD), independent of the group's base currency.
- Requires a `currency` column on `expenses`
- Requires exchange rate integration (e.g. exchangerate.host or OpenExchangeRates) to convert all amounts to the group's base currency before computing balances
- UI: currency selector on the Add/Edit Expense modal
- Balance display: show amounts in base currency with original noted

## Group Lifecycle

### Auto-delete empty groups
Delete a group (and all its data) automatically when the last member leaves.
- Add a Supabase DB trigger on `group_members` AFTER DELETE: if no members remain, delete the group row (cascades to expenses, splits, settlements, events)
- SQL: `delete_empty_group()` trigger function on `group_members`

### Leave group safety checks
Prevent a user from leaving a group if they have unsettled balances.
- Block leave if user is owed money (others need to settle with them first)
- Block leave if user owes money (they need to settle before leaving)
- Show a clear message: "You owe X — settle up before leaving" or "You are owed X — ask others to settle first"
- Consider: allow leaving anyway with a warning/override for edge cases (e.g. debt written off)
- Consider: transfer group ownership if the leaving user is the owner

## Backlog

- **Expense comments** — add notes/context to individual expenses
- **Export** — download group expenses as CSV or PDF
- **Mobile app** — React Native or PWA wrapper
