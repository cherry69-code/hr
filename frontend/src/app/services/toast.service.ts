import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSubject = new BehaviorSubject<ToastMessage[]>([]);
  toasts$ = this.toastsSubject.asObservable();

  show(type: ToastType, message: string, durationMs?: number) {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const toast: ToastMessage = { id, type, message };

    const next = [...this.toastsSubject.value, toast];
    this.toastsSubject.next(next);

    const ttl =
      durationMs ??
      (type === 'error' ? 8000 : type === 'info' ? 5000 : 4000);

    setTimeout(() => this.dismiss(id), ttl);
  }

  success(message: string, durationMs?: number) {
    this.show('success', message, durationMs);
  }

  error(message: string, durationMs?: number) {
    this.show('error', message, durationMs);
  }

  info(message: string, durationMs?: number) {
    this.show('info', message, durationMs);
  }

  dismiss(id: string) {
    const filtered = this.toastsSubject.value.filter((t) => t.id !== id);
    this.toastsSubject.next(filtered);
  }

  clear() {
    this.toastsSubject.next([]);
  }
}

