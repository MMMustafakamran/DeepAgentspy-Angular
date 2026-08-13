/**
 * "For a custom thread list, use injectThreads", verbatim.
 * https://docs.copilotkit.ai/angular/deepagents/guides/threads-memory-attachments-headless
 */
import { Component } from '@angular/core';
import { injectThreads } from '@copilotkit/angular';

@Component({
  selector: 'app-thread-list',
  template: `
    <button type="button" (click)="threads.startNewThread()">
      New conversation
    </button>

    @if (threads.isLoading()) {
      <p>Loading conversations…</p>
    } @else {
      @for (thread of threads.threads(); track thread.id) {
        <button type="button" (click)="select(thread.id)">
          {{ thread.name ?? "Untitled conversation" }}
        </button>
      }
    }

    @if (threads.listError()) {
      <button type="button" (click)="threads.refetchThreads()">Retry</button>
    }
  `,
})
export class ThreadListComponent {
  readonly threads = injectThreads({
    agentId: 'support',
    limit: 20,
  });

  protected select(threadId: string): void {
    // Store this id and bind it to CopilotChat's threadId input.
    console.log(threadId);
  }
}
