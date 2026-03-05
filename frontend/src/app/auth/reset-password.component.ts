import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reset-password.component.html'
})
export class ResetPasswordComponent {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  password = '';
  confirmPassword = '';
  loading = false;
  error = '';
  success = '';

  submit() {
    this.error = '';
    this.success = '';

    if (!this.password || this.password.length < 6) {
      this.error = 'Password must be at least 6 characters';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }

    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error = 'Invalid reset link';
      return;
    }

    this.loading = true;
    this.http.put(`${environment.apiUrl}/auth/resetpassword/${token}`, { password: this.password }).subscribe({
      next: () => {
        this.success = 'Password updated. Redirecting to login...';
        setTimeout(() => this.router.navigate(['/auth/login']), 800);
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to reset password';
        this.loading = false;
      }
    });
  }
}
