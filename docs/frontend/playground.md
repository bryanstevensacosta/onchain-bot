# Writer practice room (`/playground`)

**What it is for:** trying out the instructions given to the automatic
writer, safely, before using them for real.

**What you see:** an editor where you write or change the instructions,
a sample of a real message, a button that shows how the finished post
would look, and a button that asks the writer for one test post (each
test uses one paid writer call). Good drafts can be saved as a reusable
template.

**Trip you can take here:** open the screen → edit the instructions →
press preview → press one test → save as template → use it in a newsroom
session.

| What the screen shows or does | Where it gets it from              |
| ----------------------------- | ---------------------------------- |
| Test a draft with the writer  | `POST /feed-api/api/llm/preview`   |
| Save a draft as a template    | `POST /feed-api/api/llm/templates` |
| Saved templates               | `GET /feed-api/api/llm/templates`  |
