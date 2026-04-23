// Servicio de autenticación — centraliza todas las llamadas HTTP al API de auth
// y maneja el almacenamiento del token en localStorage
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // URL base del backend (producción en AWS)
  private URL = 'https://hipstagram-kevin.duckdns.org/api/auth';

  constructor(private http: HttpClient) {}

  // Llamar al API para registrar un nuevo usuario
  registrar(usuario: any): Observable<any> {
    return this.http.post(`${this.URL}/registro`, usuario);
  }

  // Llamar al API para hacer login y guardar los tokens automáticamente
  login(credenciales: any): Observable<any> {
    return this.http.post(`${this.URL}/login`, credenciales).pipe(
      // tap ejecuta una acción lateral sin modificar la respuesta
      tap((res: any) => {
        // Guardar token, refreshToken y datos del usuario en el navegador
        if (res.token)        localStorage.setItem('token', res.token);
        if (res.refreshToken) localStorage.setItem('refreshToken', res.refreshToken);
        if (res.usuario)      localStorage.setItem('usuario', JSON.stringify(res.usuario));
      })
    );
  }

  // Llamar al API para renovar el access token usando el refreshToken guardado
  refresh(): Observable<any> {
    const refreshToken = localStorage.getItem('refreshToken');
    return this.http.post(`${this.URL}/refresh`, { refreshToken }).pipe(
      tap((res: any) => {
        // Reemplazar el access token expirado por el nuevo
        if (res.token) localStorage.setItem('token', res.token);
      })
    );
  }

  guardarToken(token: string): void {
    localStorage.setItem('token', token);
  }

  // Leer el access token guardado para enviarlo en los headers
  obtenerToken(): string | null {
    return localStorage.getItem('token');
  }

  obtenerRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  // Verificar si el usuario tiene sesión activa (si existe token en localStorage)
  estaLogueado(): boolean {
    return !!localStorage.getItem('token');
  }

  // Cerrar sesión: limpiar todos los datos guardados en el navegador
  cerrarSesion(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('usuario');
  }
}
