# EVIL GENIUS: Let Decider Choose the Henchman

Stealing the Moon is an ambitious business plan. Keeping the people hired to steal it from bankrupting the operation is the real challenge.

In EVIL GENIUS, you run a villainous organization with a limited budget, a questionable crew, and one very unreasonable goal. Build your secret lair, equip your henchmen, manage their stress, and launch a lunar heist. Meanwhile, bills keep coming and crises interrupt your carefully laid plans. World domination apparently involves a lot of management.

I built this browser game to explore a small but useful question: **could a decision model choose the right specialist for a mission without taking over the game?**

[Play the game](https://d2gk454hfl6odl.cloudfront.net/) or [watch the updated demo](https://youtu.be/AxoIDTQoSzA).

## Earn your Moon shot

The Moon is now the finale, not your first errand. Raid a rival's payroll, hijack a satellite uplink, and field-test a shrink ray before attempting the lunar heist. Between operations, expand the lair, research equipment, lower heat, and give exhausted crew a day off.

There is one operation launch per game day. Crises have visible deadlines and real consequences. Broken equipment stops helping until repaired. Escape plans now favor different skills: science for a technical getaway, deception for a clever exit, and force for a loud one.

Testing exposed a dull loop: a failed escape could send you back through work you had already completed. The current campaign keeps earned contract milestones, and completed failures provide a small, capped bonus on retries. Forfeiting does not earn that help. You can still lose the campaign, but a botched getaway does not erase a successful shrink-ray test.

## The scientist or the guy with the hammer?

Your crew has different specialties. Science, force, deception, and finance can all be useful, depending on the plan. The choice matters because each henchman brings different abilities, stress, and equipment to the mission.

When the team reaches the Breach stage, the moment when the plan has to get past the obstacle, Strands Decider 2B gets a job:

> Given this plan, crew, and equipment, which available specialist action is most useful?

It can choose only from the specialties you actually brought. It cannot summon an absent henchman or invent a new ability. Its choice determines which crew member's abilities affect the next roll.

Think of it as a mission adviser with a very short menu. Sometimes you need the scientist. Sometimes you need the hammer. Giving everyone a hammer would certainly simplify the meeting, but it would make the finance department considerably worse.

## The model chooses. The game rolls the dice.

After Decider picks a specialist, the game's rules settle the outcome. The model cannot award itself a victory, rewrite your bank balance, or declare that the Moon was inside us all along.

Then Amazon Bedrock, using Nova Lite, gives the chosen character something to say about what happened. That dialogue adds personality, but it cannot change the result.

Each part has one job: **Decider chooses the specialist, the game resolves the consequences, and Bedrock supplies the commentary.** The mission report shows those parts separately so you can see what actually happened.

## One real Moon heist, and the campaign around it

The updated 2-minute-11-second demo tours the current public campaign, shows a fresh payroll operation and next-day satellite unlock, and includes a victory capture from a separate full day-8 public playtest. It also clearly labels a short earlier live Moon-heist recording. In that recording, Decider chose science, putting Dr. Malpractice's skills to work. The Breach succeeded, Nova Lite supplied his dialogue, and the mission eventually reached victory.

That was a real model response and a real game result. It was not a guaranteed win. In another live test, Decider answered successfully and the mission still failed its roll. The current campaign recovers the launch fee on a completed failure, without making failed missions profitable.

That distinction is part of the fun. Getting advice does not mean the universe owes you a successful lunar robbery. The confidence shown beside a model choice is also separate from your chance of winning.

## What did not go smoothly

Waiting was the biggest problem. In the earlier live recording, Decider took about 70 seconds to respond on my CPU deployment. In the latest three-contract integration check, the first call took about 73 seconds and the later calls took about 21-22 seconds. These are observations from this deployment, not a speed guarantee. The updated video shows the response rather than replaying the startup wait.

That taught me something more useful than a flattering speed claim: a game needs to keep working when the model does not answer quickly, or cannot answer at all.

EVIL GENIUS has a built-in backup choice and tells you when it is being used. Daily limits also keep public play from turning a fictional villain's spending problem into my actual AWS bill. When paid inference is unavailable, you can still play.

I am not claiming this setup is faster or cheaper than another model. This experiment is about making one meaningful decision visible, useful, and contained.

The latest release passed 101 automated checks. I also played browser runs that ended in both victory and heat defeat, and tested real decisions and narration for the new contracts. Scripted strategy tests helped expose long retry loops, but they are not a measure of human enjoyment or playtime.

Another live test caught the narrator inventing a success percentage. The game had already fixed the result, but the line could still mislead a player. The frontend now suppresses numeric narration and always keeps the actual roll and rewards separate from the flavor dialogue. That check is useful, not a guarantee that every generated line will be perfect.

## Take the useful part home

The [public source](https://github.com/kcasko/evil-genius) includes a [reusable decision recipe](https://github.com/kcasko/evil-genius/tree/main/patterns/specialist-selection). It shows how to give Decider a clear question and a list of available actions, check its answer, and run only the selected action. Instructions, a no-network example, and tests are included.

You could adapt that pattern to choosing a troubleshooting tool or routing work to an available specialist. Those are possible uses, not features claimed for this game.

For builders who want the details: the game runs on AWS, with CloudFront and S3 serving the frontend, Lambda handling requests, Strands Decider 2B running on CPU in Bedrock AgentCore Runtime, and Amazon Bedrock Nova Lite generating dialogue. The repository documents the exact model version, measurements, safeguards, and deployment wiring.

The pattern demonstrated is **tool selection**: choosing among available specialist actions. Submission tags: **#strands-decider-2b #tool-selection**.

The experiment's lesson is simple: give the model a decision worth making, let the player see its consequences, and keep the rules in charge. If everything goes wrong, at least the accountant can explain why you cannot afford another Moon.

*The 131-second demo is an edited current-build screenshot tour: fresh payroll mission choices, daily-limit fallback, next-day satellite unlock, and a separate verified day-8 victory capture. It includes 18 seconds of clearly labeled earlier real Decider/Nova footage. It is not a continuous full-campaign recording. Older browser saves keep their original short-run rules; New Game starts the campaign.*

