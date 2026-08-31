/**
 * Chrome-free demo routes. Each one mounts exactly the feature its doc route
 * documents, with nothing but a thin back-bar above it, so a demo can be
 * screen-recorded on its own.
 *
 * All demos share the application-root CopilotKit provider, so a conversation
 * started in one demo continues in another — the Quickstart, Frontend tools,
 * A2UI, and Headless demos all drive the `default` agent and therefore show the
 * same conversation through four different interfaces.
 */
import { Component, signal } from '@angular/core';

import { DemoFrame } from '../components/demo-frame';
import { A2uiChatComponent } from '../features/a2ui/a2ui-chat.component';
import { MediaChatComponent } from '../features/attachments/media-chat.component';
import { ChatUiDemoComponent } from '../features/chat-ui/chat-ui-demo.component';
import { HeadlessChatComponent } from '../features/headless/headless-chat.component';
import { HitlChatComponent } from '../features/hitl/hitl-chat.component';
import { InterruptsChatComponent } from '../features/hitl/interrupts-chat.component';
import { InspectorProbeComponent } from '../features/inspector/inspector-probe.component';
import { MemoryDemoComponent } from '../features/memory/memory-demo.component';
import { VoiceChatComponent } from '../features/media/voice-chat.component';
import { QuickstartChat } from '../features/quickstart/quickstart-chat';
import { SharedStateChatComponent } from '../features/shared-state/shared-state-chat.component';
import { ThreadsDemoComponent } from '../features/threads/threads-demo.component';
import { ToolsChatComponent } from '../features/tools/tools-chat.component';

@Component({
  selector: 'app-quickstart-demo',
  imports: [DemoFrame, QuickstartChat],
  template: `<app-demo-frame backTo="/quickstart"
    ><app-quickstart-chat
  /></app-demo-frame>`,
})
export class QuickstartDemo {}

@Component({
  selector: 'app-chat-ui-demo-page',
  imports: [DemoFrame, ChatUiDemoComponent],
  template: `<app-demo-frame backTo="/chat-ui"
    ><app-chat-ui-demo
  /></app-demo-frame>`,
})
export class ChatUiDemo {}

@Component({
  selector: 'app-tools-demo',
  imports: [DemoFrame, ToolsChatComponent],
  template: `<app-demo-frame backTo="/frontend-tools-generative-ui"
    ><app-tools-chat
  /></app-demo-frame>`,
})
export class ToolsDemo {}

@Component({
  selector: 'app-a2ui-demo',
  imports: [DemoFrame, A2uiChatComponent],
  template: `<app-demo-frame backTo="/a2ui"><app-a2ui-chat /></app-demo-frame>`,
})
export class A2uiDemo {}

@Component({
  selector: 'app-voice-demo',
  imports: [DemoFrame, VoiceChatComponent],
  template: `<app-demo-frame backTo="/voice-multimodal"
    ><app-voice-chat
  /></app-demo-frame>`,
})
export class VoiceDemo {}

@Component({
  selector: 'app-hitl-demo',
  imports: [DemoFrame, HitlChatComponent],
  template: `<app-demo-frame backTo="/human-in-the-loop"
    ><app-hitl-chat
  /></app-demo-frame>`,
})
export class HitlDemo {}

/**
 * The interrupt half of the same doc page, on its own route. Split from the
 * tool demo because only the tool actually runs here -- the two were sharing a
 * frame in which one surface was permanently blank.
 */
@Component({
  selector: 'app-interrupts-demo',
  imports: [DemoFrame, InterruptsChatComponent],
  template: `<app-demo-frame backTo="/interrupts"
    ><app-interrupts-chat
  /></app-demo-frame>`,
})
export class InterruptsDemo {}

/**
 * The Inspector has no surface of its own — the framework mounts
 * `cpk-web-inspector` on `document.body` — so this demo is a before/after of
 * the condition that actually governs whether it appears.
 *
 * The chat starts UNMOUNTED on purpose. `provideCopilotKit` is already in
 * effect at the application root, so by the guide's description the Inspector
 * should be on screen; it is not, because nothing has injected the
 * `CopilotKit` service yet. Mounting the chat injects it, and the mount check
 * flips. Showing the flip is the only way to demonstrate a precondition the
 * page does not mention, and it doubles as the quickstart's own Inspector
 * step — "send a chat message ... events are moving" — which needs a chat.
 *
 * One-way by nature: once a consumer has mounted, the element stays for the
 * life of the document, so unmounting the chat again would prove nothing.
 */
@Component({
  selector: 'app-inspector-demo',
  imports: [DemoFrame, InspectorProbeComponent, QuickstartChat],
  template: `<app-demo-frame backTo="/inspector">
    <div style="display: flex; flex-direction: column; height: 100%">
      <app-inspector-probe />

      @if (chatMounted()) {
        <div style="flex: 1; min-height: 0">
          <app-quickstart-chat />
        </div>
      } @else {
        <div style="padding: 0.75rem">
          <button
            type="button"
            data-testid="mount-chat"
            (click)="chatMounted.set(true)"
          >
            Mount a chat (injects the CopilotKit service)
          </button>
        </div>
      }
    </div>
  </app-demo-frame>`,
})
export class InspectorDemo {
  protected readonly chatMounted = signal(false);
}

@Component({
  selector: 'app-shared-state-demo',
  imports: [DemoFrame, SharedStateChatComponent],
  template: `<app-demo-frame backTo="/shared-state"
    ><app-shared-state-chat
  /></app-demo-frame>`,
})
export class SharedStateDemo {}

@Component({
  selector: 'app-threads-demo-page',
  imports: [DemoFrame, ThreadsDemoComponent],
  template: `<app-demo-frame backTo="/threads"
    ><app-threads-demo
  /></app-demo-frame>`,
})
export class ThreadsDemo {}

@Component({
  selector: 'app-memory-demo-page',
  imports: [DemoFrame, MemoryDemoComponent],
  template: `<app-demo-frame backTo="/memory"
    ><app-memory-demo
  /></app-demo-frame>`,
})
export class MemoryDemo {}

@Component({
  selector: 'app-attachments-demo',
  imports: [DemoFrame, MediaChatComponent],
  template: `<app-demo-frame backTo="/attachments"
    ><div style="height: 100%"><app-media-chat /></div
  ></app-demo-frame>`,
})
export class AttachmentsDemo {}

@Component({
  selector: 'app-headless-demo',
  imports: [DemoFrame, HeadlessChatComponent],
  template: `<app-demo-frame backTo="/headless"
    ><div style="height: 100%; overflow: auto; padding: 1rem">
      <app-headless-chat /></div
  ></app-demo-frame>`,
})
export class HeadlessDemo {}
