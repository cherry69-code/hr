import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IncentiveService } from '../services/incentive.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-incentive-rule-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './incentive-rule-builder.component.html'
})
export class IncentiveRuleBuilderComponent implements OnInit {
  incentiveService = inject(IncentiveService);
  private toast = inject(ToastService);

  slabs: any[] = [];
  
  newSlab: any = {
    role: 'N1',
    eligibilityTarget: 0,
    basePercentage: 0,
    abovePercentage: 0,
    esopPercentage: 20,
    isActive: true
  };

  isEditing = false;
  editingId: string | null = null;

  roles = ['NE', 'N0', 'N1', 'N2', 'N3', 'Manager'];

  ngOnInit() {
    this.loadSlabs();
  }

  loadSlabs() {
    this.incentiveService.getSlabs().subscribe({
      next: (res: any) => this.slabs = res.data,
      error: (err) => this.toast.error(err.error?.error || 'Failed to load slabs')
    });
  }

  saveRule() {
    if (this.isEditing && this.editingId) {
      this.incentiveService.updateSlab(this.editingId, this.newSlab).subscribe({
        next: () => {
          this.toast.success('Slab updated successfully');
          this.resetForm();
          this.loadSlabs();
        },
        error: (err) => this.toast.error(err.error?.error || 'Failed to update slab')
      });
    } else {
      this.incentiveService.createSlab(this.newSlab).subscribe({
        next: () => {
          this.toast.success('Slab created successfully');
          this.resetForm();
          this.loadSlabs();
        },
        error: (err) => this.toast.error(err.error?.error || 'Failed to create slab')
      });
    }
  }

  editSlab(slab: any) {
    this.isEditing = true;
    this.editingId = slab._id;
    this.newSlab = { ...slab };
  }

  deleteSlab(id: string) {
    if (confirm('Are you sure?')) {
      this.incentiveService.deleteSlab(id).subscribe({
        next: () => {
          this.toast.success('Slab deleted successfully');
          this.loadSlabs();
        },
        error: (err) => this.toast.error(err.error?.error || 'Failed to delete slab')
      });
    }
  }

  resetForm() {
    this.isEditing = false;
    this.editingId = null;
    this.newSlab = {
      role: 'N1',
      eligibilityTarget: 0,
      basePercentage: 0,
      abovePercentage: 0,
      esopPercentage: 20,
      isActive: true
    };
  }
}
