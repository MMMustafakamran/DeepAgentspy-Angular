/**
 * The guide's first path: a decision tool. The agent calls `requestApproval`,
 * the card renders inside the chat's tool-call flow, and the run stays paused
 * until the user answers.
 * https://docs.copilotkit.ai/angular/deepagents/guides/human-in-the-loop
 *
 * Injecting ApprovalToolsService is what constructs it, and construction is
 * what performs the `registerHumanInTheLoop` call.
 *
 * The guide's second path — interrupts, where the *backend* chooses the pause —
 * lives on its own route. The two are separated because only this one runs
 * here: the DeepAgents agent emits no AG-UI interrupt, so mounting an idle
 * interrupt panel beside a working tool made one demo where half the surface
 * was permanently blank and nothing said which half was which. See
 * `interrupts-chat.component.ts`.
 */
import { Component, inject } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

import { ApprovalToolsService } from './approval-tools.service';

@Component({
  selector: 'app-hitl-chat',
  imports: [CopilotChat],
  providers: [ApprovalToolsService],
  template: `
    <div style="display: flex; flex-direction: column; height: 100%">
      <div style="flex: 1; min-height: 0">
        <copilot-chat />
      </div>
    </div>
  `,
})
export class HitlChatComponent {
  private readonly approvalTools = inject(ApprovalToolsService);
}
