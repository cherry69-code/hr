import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-[320px] max-w-[90vw] pointer-events-none">
      <div *ngFor="let t of (toastService.toasts$ | async)" class="pointer-events-auto">
        <div
          class="rounded-xl shadow-lg border px-4 py-3 flex items-start gap-3"
          [ngClass]="{
            'bg-green-50 border-green-200 text-green-800': t.type === 'success',
            'bg-red-50 border-red-200 text-red-800': t.type === 'error',
            'bg-slate-50 border-slate-200 text-slate-800': t.type === 'info'
          }"
        >
          <div class="flex-1 text-sm leading-5">{{ t.message }}</div>
          <button
            type="button"
            class="text-xs font-semibold opacity-70 hover:opacity-100"
            (click)="toastService.dismiss(t.id)"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  `
})
export class ToastComponent {
  toastService = inject(ToastService);
}

