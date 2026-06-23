> For the complete documentation index, see [llms.txt](https://docs.spydefi.org/spydefi-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.spydefi.org/spydefi-docs/spydefi-paid-user-tools/filters-in-action.md).

# Filters In Action&#x20;

Here we will delve into two worked examples of applications of the filters for the purpose of deeper understanding.&#x20;

#### 1) 🔮 Tapping into emerging trends/metas&#x20;

The DeFi space often revolves around fast paced shifts in trends and metas, either fuelled by external viral trends, or notable projects that spur on the creation of ones similar in ilk.

EXAMPLE

Let's say that there was renewed interest around the meme stock 'GME' across social media and legacy media, this may also generate interest in the Web3 world around the same topic.

For filters users, they can act quickly, in hope of being alerted on any projects launched revolving around this narrative.&#x20;

Through the 'Word Scanning' tool, users can may add some custom words, that may appear in the posts of KOLs about this subject.

{% hint style="info" %}
*'GME'   'Roaring'   'Stocks'   'Kitty'     'Gamestop'*&#x20;
{% endhint %}

Perhaps the user would rather just find projects with the letter string 'GME" in, and add that parameter instead.

{% hint style="success" %}
Combining the above with a short maximum pair age for example of '20 minutes' and a consistency % score of their preference, the user will be well positioned within minutes to be alerted of any signals that pertain to this emerging trend.&#x20;
{% endhint %}

#### 2) ⌛️ Quality Over Quantity&#x20;

The temptation from many users are to adjust the parameters so there is a significant flow of alerts, often borne out of impatience or a desire for instant gratification.&#x20;

Others may opt for a more calculated approach, slowly building up their parameters settings, curating and monitoring, adjusting after adding each new until they have stringent settings that are delivering the type of signals they want to see. The signals may be very infrequent but for the user they have significantly cut out the 'noise' and are delivering the profile of KOL/project they desire to see. &#x20;

EXAMPLE

Let's say a user has a penchant for utility projects on ETH, they may build up their settings slowly until they reach a curated feed that sends a handful of signals a week (market dependent).

{% hint style="success" %}
They may achieve this by combining a high chain specific consistency %, selecting ETH chain solely, and perhaps even including some words in the word scanning tool, for example 'utility' 'building'.
{% endhint %}


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.spydefi.org/spydefi-docs/spydefi-paid-user-tools/filters-in-action.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
