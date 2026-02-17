# Multi-Section Diff Review Feature

Status: **WIP — paused during brainstorming**

## Overview

When the user asks Claude (via Chat tab) to update a document using external data from MCP calls (transcripts, database queries, etc.), instead of returning one big modified document, Claude produces per-section diffs the user can review individually.

## Decisions Made

1. **Entry point**: Chat tab — user asks naturally, Claude calls whatever MCPs it needs. No special UI for fetching external data.
2. **Section splitting**: Hybrid — split by headings (`##`), but only show diffs for sections Claude actually changed. Unchanged sections are skipped.
3. **Review UI**: Stacked list in the Edits tab. Each section diff has independent approve/deny/comment controls. Review in any order.
4. **Comment/revision flow**: Commenting on a section diff sends feedback back to Claude within the same chat context. Claude already has all MCP results and document context from the conversation. Returns a revised diff for that section.
5. **Apply strategy**: Batch at the end. Approvals queue up. Single "Apply all approved" button patches the document in one shot. Original document stays stable during review.
6. **Relationship to existing flow**: Separate flows. The existing comment-based single-diff edit flow stays as-is for quick targeted edits. Chat-driven multi-section diffs are a distinct mode.

## Data Model (draft)

```typescript
interface SectionDiff {
  id: string                    // unique id for this diff
  sectionHeading: string        // e.g. "## Market Analysis"
  sectionIndex: number          // position in document (0-based)
  originalText: string          // the original section content
  proposedText: string          // Claude's proposed replacement
  status: 'pending' | 'approved' | 'denied' | 'revising'
  comments: RevisionComment[]   // thread of user feedback + Claude revisions
}

interface RevisionComment {
  id: string
  text: string                  // user's feedback
  revisedText: string | null    // Claude's revised proposal after this comment
  timestamp: number
}

interface SectionDiffBatch {
  id: string
  chatMessageId: string         // links back to the chat turn that produced this
  sectionDiffs: SectionDiff[]
  status: 'reviewing' | 'applied' | 'discarded'
}
```

## Still TODO

- Component architecture (new components, how they fit in Edits tab)
- How Claude's response is structured to produce per-section diffs (prompt engineering / output format)
- Section parsing logic (splitting markdown by headings)
- How the "Apply all approved" merge works (patching sections back into full markdown)
- Error handling (what if Claude can't diff a section, conflicts between sections)
- Chat context threading for revision rounds
