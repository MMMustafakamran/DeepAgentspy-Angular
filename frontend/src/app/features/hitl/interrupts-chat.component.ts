/**
 * The guide's second path: an interrupt, where the backend agent — not the
 * model — chooses the pause.
 * https://docs.copilotkit.ai/angular/deepagents/guides/human-in-the-loop
 *
 * 0.4.0 documents two controllers for this and warns against rendering both
 * for the same decision, because each observes the agent independently and two
 * UI actions could try to resume the same run. The switch below is that
 * warning made operable: exactly one panel is in the DOM at a time, so either
 * path can be shown without ever entering the state the guide rules out.
 *
 * Both panels stay blank here. The DeepAgents agent in this repo emits no
 * AG-UI interrupt and no legacy `on_interrupt` event, so there is never a
 * pending decision to render. That is a property of the backend, not a defect
 * in either controller — but it is also why this route says so on screen:
 * a blank panel and a broken panel look identical, and one of the two
 * controllers here *is* broken as published (see the store panel's header).
 */
import { Component, signal } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

import { InterruptPanelComponent } from './interrupt-panel.component';
import { StoreInterruptPanelComponent } from './store-interrupt-panel.component';

type InterruptPath = 'store' | 'typed';

@Component({
  selector: 'app-interrupts-chat',
  imports: [CopilotChat, InterruptPanelComponent, StoreInterruptPanelComponent],
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

      <!--
        Without this the route is indistinguishable from a broken one: the
        panels are headless, so an agent that never interrupts renders exactly
        what a crashed controller renders.
      -->
      <p data-testid="interrupt-idle" style="padding: 0 0.5rem; font-size: 0.8rem">
        No pending interrupt. This backend emits none, so both controllers stay
        blank by design — the panel above is mounted and listening.
      </p>

      <div style="flex: 1; min-height: 0">
        <copilot-chat />
      </div>
    </div>
  `,
})
export class InterruptsChatComponent {
  /**
   * Defaults to the store path, which is the one the guide now presents first
   * and the one a reader gets without opting into anything.
   */
  protected readonly path = signal<InterruptPath>('store');
}
