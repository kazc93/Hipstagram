import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router'; // Para el enlace de volver al login
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './registro.component.html',
  styleUrl: './registro.component.css'
})
export class RegistroComponent {
  nuevoUsuario = {
    username: '',
    email: '',
    password: '',
    nombre_completo: ''
  };

  constructor(private authService: AuthService, private router: Router) {}

  registrar() {
    this.authService.registrar(this.nuevoUsuario).subscribe({
      next: (res) => {
        alert('¡Usuario creado con éxito!');
        this.router.navigate(['/login']);
      },
      error: (err) => {
        alert('Error en el registro. Intenta con otro nombre de usuario.');
      }
    });
  }
}