import { Component, ElementRef, EventEmitter, Output, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import SignaturePad from 'signature_pad';

@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <h3 class="text-lg font-semibold mb-4 text-gray-800">Sign Document</h3>
        
        <div class="border-2 border-dashed border-gray-300 rounded-lg mb-4 bg-gray-50 touch-none relative">
          <canvas #canvas class="w-full h-48 cursor-crosshair block"></canvas>
          <div *ngIf="isEmpty" class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span class="text-gray-400 text-sm">Draw signature here</span>
          </div>
        </div>

        <div class="flex justify-between items-center">
          <button (click)="clear()" class="px-4 py-2 text-sm text-red-600 hover:text-red-800 font-medium">
            Clear
          </button>
          <div class="space-x-2">
            <button (click)="close()" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button (click)="save()" [disabled]="isEmpty" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              Sign & Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    canvas {
      touch-action: none;
    }
  `]
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() signed = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  private signaturePad!: SignaturePad;
  isEmpty = true;

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    
    // Resize canvas for high DPI
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')!.scale(ratio, ratio);

    this.signaturePad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)'
    });

    this.signaturePad.addEventListener('beginStroke', () => {
      this.isEmpty = false;
    });
    
    // Check initially (though usually empty)
    this.isEmpty = this.signaturePad.isEmpty();
  }

  ngOnDestroy() {
    this.signaturePad?.off();
  }

  clear() {
    this.signaturePad.clear();
    this.isEmpty = true;
  }

  save() {
    if (this.signaturePad.isEmpty()) {
      return;
    }
    const data = this.signaturePad.toDataURL('image/png');
    this.signed.emit(data);
  }

  close() {
    this.cancelled.emit();
  }
}
