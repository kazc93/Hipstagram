import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {
  terminoBusqueda: string = '';
  usuarioActual: any = null;

  constructor(private router: Router) {
    const u = localStorage.getItem('usuario');
    if (u) this.usuarioActual = JSON.parse(u);
  }

  esAdmin(): boolean {
    return this.usuarioActual?.rol == 'ADMIN';
  }

  buscar() {
    if (!this.terminoBusqueda.trim()) return;
    this.router.navigate(['/busqueda'], {
      queryParams: { q: this.terminoBusqueda }
    });
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}