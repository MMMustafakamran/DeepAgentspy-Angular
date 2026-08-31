import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-interrupts-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode],
  template: `
    <app-route-header path="/interrupts" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo and switch between the two controllers. There is nothing
          to send: an interrupt is raised by the backend, not by the model.
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass:</strong> exactly one panel is mounted at a time, and the
          route says plainly that no interrupt is pending.
          <strong>Fail:</strong> both panels mounted at once, or a blank panel
          with nothing explaining why it is blank.
        </p>
      </ui-try-it>

      <ui-callout title="This half does not run against this backend">
        Both controllers are headless — they render only when the agent emits an
        AG-UI interrupt or the legacy <code>on_interrupt</code> event. The
        DeepAgents agent in this repo emits neither, so there is never a pending
        decision here. That is the backend's shape, not a defect in the
        controllers — but it is called out because an idle headless panel and a
        failed one look exactly the same on screen.
      </ui-callout>

      <ui-panel heading="The interrupt controller on the store">
        <p class="mb-3 text-sm text-slate-700">
          Added by <code>&#64;copilotkit/angular</code> 0.4.0. The store that
          already exposes a conversation's messages and state exposes its
          pending interrupt too, on
          <code>store().interruptController</code>, so a component holding a
          store needs nothing else. It is created and connected with the store
          and destroyed when the store is torn down or replaced.
        </p>
        <ui-source
          path="src/app/features/hitl/store-interrupt-panel.component.ts"
        />
      </ui-panel>

      <p class="text-sm text-slate-600">
        <strong>Note:</strong> the guide writes
        <code>injectAgentStore("ticketing")</code> in this snippet. No
        <code>ticketing</code> agent exists in these docs, so this route passes
        <code>"default"</code> — the agent the quickstart registers. Everything
        else is verbatim.
      </p>

      <ui-panel heading="The typed interrupt controller">
        <p class="mb-3 text-sm text-slate-700">
          <code>injectInterrupt</code> is the escape hatch for when the store
          default is not enough — a typed payload, an <code>enabled</code>
          filter, or a <code>handler</code> that prepares data for the view. As
          of 0.4.0 it takes the agent id positionally,
          <code>injectInterrupt&lt;T&gt;('default')</code>; the original
          <code>{{ '{' }} agentId {{ '}' }}</code> object is still accepted by a
          compatibility overload, so the change does not break existing code.
        </p>
        <p class="mb-3 text-sm text-slate-700">
          The controller clears stale decisions when the thread changes, and
          <code>resolve</code>/<code>cancel</code> share one in-flight resume
          promise so a double click cannot start two resume runs.
        </p>
        <ui-source path="src/app/features/hitl/interrupt-panel.component.ts" />
      </ui-panel>

      <ui-callout title="Do not render both controllers for the same decision">
        The guide warns that a store controller and an
        <code>injectInterrupt</code> controller observe the agent
        independently, so one interrupt becomes visible in both and two UI
        actions could attempt to resume the same run. The demo enforces this
        rather than describing it: the switch mounts exactly one panel at a
        time, so the unsupported state is never reachable.
      </ui-callout>

      <ui-panel heading="The other half of this doc page">
        <p class="text-sm text-slate-700">
          The same guide's decision-tool path — where the model, not the
          backend, chooses to ask — is at
          <a class="underline" href="/human-in-the-loop">/human-in-the-loop</a>.
          That half works end to end.
        </p>
      </ui-panel>
    </div>
  `,
})
export default class InterruptsPage {}
