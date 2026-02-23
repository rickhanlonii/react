# Layout Fixer — Current State

**Status**: idle
**Current task**: none
**Blocked on**: nothing

## Known Limitations
- **Asymmetric minWidth in flex**: Yoga distributes surplus from sum of minWidths, not CSS iterative freeze-and-redistribute
- **Margin collapse-through**: Yoga block layout doesn't propagate escaped child margins to parent; LayoutExtractor adjustment skips elements with explicit height
- **Absolute positioning ancestry**: Yoga positions absolute children relative to direct parent, not nearest positioned ancestor

## Next
- Awaiting: next assignment from team lead
