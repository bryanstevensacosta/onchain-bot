> For the complete documentation index, see [llms.txt](https://docs.spydefi.org/spydefi-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.spydefi.org/spydefi-docs/spydefi-for-users/kol-statistics.md).

# KOL Statistics

### 💬 Channel Statistics

In channel statistics, you can see a range of data pertaining to the overall performance of the KOL.&#x20;

#### ⚖️ Overall Consistency

This represents the % of calls made by a KOL that have provided Xs.&#x20;

#### 🔗 Chain-specific Consistency

This feature allows the consistency % to be viewed by chain, rather than just overall, as often a KOL has chained they tend to favour/perform better on than others.&#x20;

#### 📈 Average X

This is the average X that calls by a KOL have achieved.

#### 📊 Average Marketcap

This is the average marketcap of calls made by a KOL.

#### 🐺 Alpha Caller

This is the number of times a caller has been the first in the network to call a project (that ends up with 10+ total network calls)

#### 💵 PnL Potential

This shows a potential profits from a $ amount invested into the previous 5 calls by a KOL, with values reflecting ATH profits, and current.&#x20;

***

### 📞 Call Statistics&#x20;

In call statistics, you can click to the view the call post, see the called at marketcap, see how many Xs (if any) the project has achieved since, and the relative ATH of the project since the call.&#x20;

#### 🏆 Best Call

This shows the best call (in terms of Xs) a KOL has made&#x20;

#### 🕰 Most Recent Call

This shows the current X of the most recent call a KOL has made

#### 🎖 Top 3 Calls

This shows the top 3 calls (in terms of Xs) a KOL has made  since being tracked by SpyDefi&#x20;

#### 🗓 5 Most Recent Calls

This shows the 5 most recent calls a KOL has made&#x20;

{% hint style="info" %}
**❓How to access?**&#x20;

Simply head to [t.me/spydefi\_bot](https://t.me/spydefi_bot) and type `/start` , select 'View KOL Stats' and type in the @ of the channel whose stats you wish to view.
{% endhint %}


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.spydefi.org/spydefi-docs/spydefi-for-users/kol-statistics.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
