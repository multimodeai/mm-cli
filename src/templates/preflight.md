# Pre-flight Checklist

Before you send your next prompt to an AI, answer these 7 questions:

1. **What is the actual outcome I need?**
   Not "help me with X" — what artifact, decision, or action should exist when this is done?

2. **What does the AI need to know that it doesn't?**
   Domain context, codebase conventions, constraints, prior decisions — what's in your head that isn't in the prompt?

3. **What would a bad response look like?**
   Define the failure modes. If you can't describe what wrong looks like, you can't evaluate what right looks like.

4. **Am I asking one clear thing or bundling multiple requests?**
   Compound prompts get compound (confused) answers. One intent per interaction.

5. **Have I specified the format I want?**
   Code? Bullet points? A table? A diff? If you don't specify, you'll get whatever the model defaults to.

6. **What's my evaluation criteria?**
   How will you know if the response is good? "It looks right" isn't a criteria. What specific qualities matter?

7. **Would a skilled colleague understand this prompt without asking clarifying questions?**
   If a senior engineer would need to ask follow-ups, the AI will silently guess instead.

---

*Run `mm diagnose` to score your current AI workflow across all 4 disciplines.*
