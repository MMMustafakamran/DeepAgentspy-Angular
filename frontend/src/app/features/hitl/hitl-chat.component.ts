/**
 * Puts the guide's two human-in-the-loop paths side by side: the decision tool
 * (registered by ApprovalToolsService, rendered inside the chat's tool-call
 * flow) and an interrupt panel (rendered outside the chat).
 * https://docs.copilotkit.ai/angular/deepagents/guides/human-in-the-loop
 *
 * Injecting ApprovalToolsService is what constructs it, and construction is
 * what performs the `registerHumanInTheLoop` call.
 *
 * Since 0.4.0 the guide documents *two* ways to read an interrupt — the agent
 * store's own `interruptController`, and a typed `injectInterrupt` controller —
 * and explicitly warns against rendering both for the same decision, because
 * each observes the agent independently and two UI actions could try to resume
 * the same run. The switch below is that warning made operable: exactly one
 * panel is in the DOM at a time, so the demo can show either path without ever
 * being in the state the guide tells readers to avoid.
 */
import { Component, inject, signal } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

import { ApprovalToolsService } from './approval-tools.service';
import { InterruptPanelComponent } from './interrupt-panel.component';
import { StoreInterruptPanelComponent } from './store-interrupt-panel.component';

type InterruptPath = 'store' | 'typed';

@Component({
  selector: 'app-hitl-chat',
  imports: [CopilotChat, InterruptPanelComponent, StoreInterruptPanelComponent],
  providers: [ApprovalToolsService],
  template: `
    <div style="display: flex; flex-direction: column; height: 100%">
      <div
        role="radiogroup"
        aria-label="Interrupt path"
        data-testid="interrupt-path"
        style="display: flex; gap: 0.5rem; padding: 0.5rem"
      >
        <button
          type="button"
          role="radio"
          data-testid="interrupt-path-store"
          [attr.aria-checked]="path() === 'store'"
          (click)="path.set('store')"
        >
          Store controller
        </button>
        <button
          type="button"
          role="radio"
          data-testid="interrupt-path-typed"
          [attr.aria-checked]="path() === 'typed'"
          (click)="path.set('typed')"
        >
          Typed controller
        </button>
      </div>

      @if (path() === 'store') {
        <app-store-interrupt-panel />
      } @else {
        <app-interrupt-panel />
      }

      <div style="flex: 1; min-height: 0">
        <copilot-chat />
      </div>
    </div>
  `,
})
export class HitlChatComponent {
  private readonly approvalTools = inject(ApprovalToolsService);

  /**
   * Defaults to the store path, which is the one the guide now presents first
   * and the one a reader gets without opting into anything.
   */
  protected readonly path = signal<InterruptPath>('store');
}
