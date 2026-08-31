import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-hitl-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode],
  template: `
    <app-route-header path="/human-in-the-loop" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo and send
          <em>Delete my account, but ask me to approve it first.</em>
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass:</strong> an Approve / Reject card renders in the message
          stream and <strong>nothing further streams until you click</strong>.
          After clicking, the run resumes with your decision.
          <strong>Fail:</strong> two options as plain text, or the agent
          continues without waiting.
        </p>
      </ui-try-it>

      <ui-panel heading="Two paths, two owners">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-slate-600">
              <th class="py-2 pr-4 font-semibold">Pattern</th>
              <th class="py-2 pr-4 font-semibold">Who chooses the pause?</th>
              <th class="py-2 font-semibold">Angular API</th>
            </tr>
          </thead>
          <tbody class="text-slate-700">
            <tr class="border-b border-slate-100">
              <td class="py-2 pr-4">Human-in-the-loop tool</td>
              <td class="py-2 pr-4">
                The agent calls a registered browser tool
              </td>
              <td class="py-2"><code>registerHumanInTheLoop</code></td>
            </tr>
            <tr>
              <td class="py-2 pr-4">Interrupt</td>
              <td class="py-2 pr-4">
                The backend agent emits an AG-UI interrupt
              </td>
              <td class="py-2">
                <code>AgentStore.interruptController</code>,
                <code>injectInterrupt</code>
                <a class="ml-1 underline" href="/interrupts">(own route)</a>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-3 text-sm text-slate-700">
          Use a tool when the model should decide whether to ask. Use an
          interrupt when the backend workflow must stop at a fixed checkpoint.
        </p>
      </ui-panel>

      <ui-panel heading="The decision renderer">
        <p class="mb-3 text-sm text-slate-700">
          The renderer receives a <code>toolCall</code> signal and calls
          <code>respond(result)</code> once the user has chosen.
        </p>
        <ui-source path="src/app/features/hitl/approval-card.component.ts" />
      </ui-panel>

      <ui-panel heading="The registration">
        <p class="mb-3 text-sm text-slate-700">
          There is no handler. CopilotKit supplies one that waits for
          <code>respond</code>, returns the decision to the agent, and continues
          the run. The registration is removed when the owning injector is
          destroyed — here, the demo component that provides the service.
        </p>
        <ui-source path="src/app/features/hitl/approval-tools.service.ts" />
        <div class="mt-4">
          <ui-source path="src/app/features/hitl/hitl-chat.component.ts" />
        </div>
      </ui-panel>

      <ui-callout title="No Python declaration is needed for this tool">
        <code>requestApproval</code> exists only in the browser. CopilotKit
        forwards frontend tools to the agent in the AG-UI run input, so the
        model can call it without a matching tool in
        <code>backend/main.py</code>. The inverse does bite: a tool declared on
        the agent with no frontend handler registered will hang the run.
      </ui-callout>

      <ui-panel heading="The other half of this doc page">
        <p class="text-sm text-slate-700">
          The same guide's interrupt path — where the backend agent, not the
          model, chooses the pause — is at
          <a class="underline" href="/interrupts">/interrupts</a>. It covers
          both controllers 0.4.0 documents, and carries this doc page's defect.
        </p>
      </ui-panel>

    </div>
  `,
})
export default class HumanInTheLoopPage {
  protected readonly showcaseSample = `// features/interrupt/interrupt-feature.component.ts
export class InterruptFeatureComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly feature =
    (this.route.snapshot.data["feature"] as string | undefined) ??
    "gen-ui-interrupt";
  protected readonly isHeadless = this.feature === "interrupt-headless";
  private readonly agentId = agentIdForCurrentIntegration(this.feature);
  protected readonly controller = injectInterrupt(this.agentId);
  protected readonly payload = computed(() =>
    parseInterruptPayload(this.controller.event()?.value),
  );
  protected readonly pickedLabel = signal<string | null>(null);
  private lastInterruptEvent: object | null = null;

  constructor() {
    effect(() => {
      const event = this.controller.event();
      if (event && event !== this.lastInterruptEvent) {
        this.lastInterruptEvent = event;
        this.pickedLabel.set(null);
      }
    });

    if (usesFrontendSchedulingTool(this.feature, integrationId())) {
      const config: HumanInTheLoopConfig<ScheduleMeetingArgs> = {
        agentId: this.agentId,
        name: "schedule_meeting",
        description:
          "Ask the user to pick a meeting time and return the selected slot.",
        parameters: z.object({
          topic: z.string(),
          attendee: z.string().optional(),
        }),
        component:
          TimePickerCard as unknown as HumanInTheLoopConfig<ScheduleMeetingArgs>["component"],
      };
      registerHumanInTheLoop(config);
    }
  }

  /** Resolve the active decision while retaining its visible confirmation. */
  protected resolve(slot: InterruptSlot): void {
    this.pickedLabel.set(slot.label);
    this.controller
      .resolve({
        chosen_time: slot.iso,
        chosen_label: slot.label,
      })
      .catch(() => undefined);
  }

  /** Cancel only the currently displayed interrupt. */
  protected cancel(): void {
    this.controller.cancel().catch(() => undefined);
  }
}`;
}
