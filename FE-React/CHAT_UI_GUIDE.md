# DevBuddy Chat UI Guide

## Overview

A fully functional ChatGPT/Claude-style chat interface built with React and Vite, featuring:

- **Sidebar** with conversation history and document uploads
- **Chat Area** with message bubbles, typing indicators, and auto-scroll
- **Chat Input** with auto-growing textarea and Enter to send
- **Dark mode** support (system preference aware)
- **Mock replies** for testing (uses random responses from a predefined list)

## What's Built

### Components

#### `Sidebar.tsx`
- Brand header with logo and "DevBuddy" title
- **New Chat** button to start fresh conversations
- **Conversation List**: view all chats, click to switch, delete individual chats
- **Document Upload**: drag-and-drop or click to upload files
- **File List**: shows uploaded files with size, option to remove each

#### `ChatArea.tsx`
- **Empty State**: welcome message with suggestion chips (cosmetic for now)
- **Message Bubbles**: user messages (purple) and assistant messages (gray)
- **Timestamps**: small time labels under each message
- **Typing Indicator**: animated dots when "thinking"
- **Auto-scroll**: jumps to latest message on new content

#### `ChatInput.tsx`
- **Textarea**: auto-expands as you type (max 200px height)
- **Send Button**: purple button with paper plane icon
- **Keyboard**: Enter to send, Shift+Enter for newline
- **Hint Text**: reminds users of shortcuts

#### `App.tsx`
- Full state management for conversations, messages, files
- Mock reply system (1.2-2s delay, random responses)
- Creates conversation on first message with auto-title (first 40 chars)
- Tracks active chat, switches between chats seamlessly

### Styling

- **Dark theme by default** for modern chat app feel
- **Supports light mode** via `prefers-color-scheme: light`
- **Colors**: purples for user, grays for assistant, clean dark backgrounds
- **Responsive**: sidebar collapses or adapts on narrow screens (structure ready)

## Running Locally

### Dev Server
```bash
cd FE
pnpm dev
# Opens at http://localhost:5174/
```

### Production Build
```bash
pnpm build
pnpm preview
```

### Type Checking & Linting
```bash
pnpm build     # Runs tsc -b first
pnpm lint      # Runs oxlint
```

## Feature Tour

1. **Start a Chat**: Click "New Chat" button
2. **Type a Message**: Write in the textarea at the bottom
3. **Send**: Press Enter or click the send button
   - Message appears instantly in purple
   - Typing indicator shows for 1-2 seconds
   - Mock assistant reply appears in gray
4. **Chat History**: Each chat is saved in the sidebar. Click any to switch.
5. **Delete Chat**: Hover over a conversation item, click the ×
6. **Upload Files**: Drag files onto the upload zone or click to browse
   - Files show in the list with name and size
   - Badge in the chat header shows file count
   - Click × on any file to remove

## Future Enhancements

### Immediate (Easy)
- **Suggestion Chips**: Make them clickable to auto-fill input (wire `onSend` to each chip in `ChatArea.tsx`)
- **Markdown Rendering**: Parse assistant replies with `react-markdown` library
- **Local Storage**: Save conversations to browser storage (no page reload loss)

### Backend Integration
- Replace mock replies with real API calls to `/api/chat` endpoint
- Send uploaded file IDs in chat payloads
- Stream responses instead of instant mock delay

### Polish
- **Emoji Picker**: Let users pick avatars instead of fixed emoji
- **Code Highlighting**: Syntax highlight code blocks in messages
- **Export Chat**: Download conversation as PDF or text
- **Settings Panel**: Font size, theme toggle, user name, etc.

## State Management

All state lives in `App.tsx`:
- `conversations[]` — array of chat objects with messages
- `activeId` — currently selected conversation ID (null = create new)
- `uploadedFiles[]` — list of uploaded file objects
- `isTyping` — boolean to disable input during mock reply

No persistence — refreshing the page clears all chats. Use localStorage or a database for persistence.

## Accessibility Notes

- Buttons are labeled with `aria-label` and have clear hover states
- Message times are in a small, accessible gray
- Dark mode defaults reduce eye strain
- Textarea grows to accommodate content without scrolling off-screen

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires ES2020+ (uses `crypto.randomUUID()`)
- Mobile-friendly layout (sidebar design scales)

---

**Enjoy building! 🚀**
