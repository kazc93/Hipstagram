import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../components/navbar/navbar.component';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnInit {
  seccion: string = 'usuarios';
  mensaje: string = '';
  esError: boolean = false;

  // ── Usuarios ─────────────────────────────────────────────────
  usuarios: any[] = [];

  // ── Posts (moderación) ───────────────────────────────────────
  posts: any[] = [];
  filtroEstado: string = '';

  // ── Hashtags prohibidos ──────────────────────────────────────
  hashtagsProhibidos: any[] = [];
  nuevoHashtag: string = '';

  // ── Audit Logs ───────────────────────────────────────────────
  logs: any[] = [];
  filtroLogs = { action: '', actor_user_id: '', result: '', desde: '', hasta: '' };

  private URL = 'https://hipstagram-kevin.duckdns.org/api/admin';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  private headers(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  private mostrarMensaje(texto: string, error = false) {
    this.mensaje = texto;
    this.esError = error;
    this.cdr.detectChanges();
    setTimeout(() => { this.mensaje = ''; this.cdr.detectChanges(); }, 3500);
  }

  ngOnInit() { this.cargarUsuarios(); }

  // ════════════════════════════════════════════════════════════
  //  USUARIOS
  // ════════════════════════════════════════════════════════════

  cargarUsuarios() {
    this.seccion = 'usuarios';
    this.http.get(`${this.URL}/usuarios`, { headers: this.headers() }).subscribe({
      next: (res: any) => { this.usuarios = res.usuarios; this.cdr.detectChanges(); },
      error: () => this.mostrarMensaje('Error al cargar usuarios', true)
    });
  }

  bloquearUsuario(id: number, activo: boolean) {
    const accion = activo ? 'bloquear' : 'activar';
    if (!confirm(`¿Deseas ${accion} este usuario?`)) return;
    this.http.put(`${this.URL}/usuarios/${id}/bloquear`, {}, { headers: this.headers() }).subscribe({
      next: (res: any) => { this.mostrarMensaje(res.mensaje); this.cargarUsuarios(); },
      error: (err: any) => this.mostrarMensaje(err.error?.mensaje || 'Error', true)
    });
  }

  // ════════════════════════════════════════════════════════════
  //  POSTS (MODERACIÓN)
  // ════════════════════════════════════════════════════════════

  cargarPosts() {
    this.seccion = 'posts';
    this.consultarPosts();
  }

  consultarPosts() {
    const params = this.filtroEstado ? `?estado=${this.filtroEstado}` : '';
    this.http.get(`${this.URL}/posts${params}`, { headers: this.headers() }).subscribe({
      next: (res: any) => { this.posts = res.posts; this.cdr.detectChanges(); },
      error: () => this.mostrarMensaje('Error al cargar posts', true)
    });
  }

  cambiarFiltroEstado(estado: string) {
    this.filtroEstado = estado;
    this.consultarPosts();
  }

  cambiarEstadoPost(id: number, estado: string) {
    this.http.put(`${this.URL}/posts/${id}/estado`, { estado }, { headers: this.headers() }).subscribe({
      next: (res: any) => { this.mostrarMensaje(res.mensaje); this.consultarPosts(); },
      error: (err: any) => this.mostrarMensaje(err.error?.mensaje || 'Error', true)
    });
  }

  // ════════════════════════════════════════════════════════════
  //  HASHTAGS PROHIBIDOS
  // ════════════════════════════════════════════════════════════

  cargarHashtagsProhibidos() {
    this.seccion = 'hashtags';
    this.http.get(`${this.URL}/hashtags-prohibidos`, { headers: this.headers() }).subscribe({
      next: (res: any) => { this.hashtagsProhibidos = res.hashtags_prohibidos; this.cdr.detectChanges(); },
      error: () => this.mostrarMensaje('Error al cargar hashtags prohibidos', true)
    });
  }

  agregarHashtag() {
    const nombre = this.nuevoHashtag.trim().replace(/^#/, '').toLowerCase();
    if (!nombre) return;

    this.http.post(`${this.URL}/hashtags-prohibidos`, { nombre }, { headers: this.headers() }).subscribe({
      next: () => {
        this.nuevoHashtag = '';
        this.mostrarMensaje(`Hashtag "#${nombre}" agregado a la lista`);
        this.cargarHashtagsProhibidos();
      },
      error: (err: any) => this.mostrarMensaje(err.error?.mensaje || 'Error', true)
    });
  }

  eliminarHashtag(id: number, nombre: string) {
    if (!confirm(`¿Eliminar "#${nombre}" de la lista prohibida?`)) return;
    this.http.delete(`${this.URL}/hashtags-prohibidos/${id}`, { headers: this.headers() }).subscribe({
      next: (res: any) => { this.mostrarMensaje(res.mensaje); this.cargarHashtagsProhibidos(); },
      error: (err: any) => this.mostrarMensaje(err.error?.mensaje || 'Error', true)
    });
  }

  // ════════════════════════════════════════════════════════════
  //  AUDIT LOGS
  // ════════════════════════════════════════════════════════════

  cargarLogs() {
    this.seccion = 'logs';
    this.consultarLogs();
  }

  consultarLogs() {
    const params = new URLSearchParams();
    if (this.filtroLogs.action)        params.set('action',        this.filtroLogs.action);
    if (this.filtroLogs.actor_user_id) params.set('actor_user_id', this.filtroLogs.actor_user_id);
    if (this.filtroLogs.result)        params.set('result',        this.filtroLogs.result);
    if (this.filtroLogs.desde)         params.set('desde',         this.filtroLogs.desde);
    if (this.filtroLogs.hasta)         params.set('hasta',         this.filtroLogs.hasta);

    const query = params.toString() ? `?${params.toString()}` : '';
    this.http.get(`${this.URL}/audit-logs${query}`, { headers: this.headers() }).subscribe({
      next: (res: any) => {
        // El servicio puede retornar { data: [] } o { logs: [] }
        this.logs = res.data ?? res.logs ?? [];
        this.cdr.detectChanges();
      },
      error: () => this.mostrarMensaje('Error al cargar logs', true)
    });
  }

  limpiarFiltrosLogs() {
    this.filtroLogs = { action: '', actor_user_id: '', result: '', desde: '', hasta: '' };
    this.consultarLogs();
  }

  // Devuelve el username real del actor o un fallback con su ID
  nombreActuador(log: any): string {
    return log.username ?? log.actor_username ?? (log.actor_user_id ? `#${log.actor_user_id}` : 'Sistema');
  }
}
