import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../components/navbar/navbar.component';
import { CrearPostComponent } from '../components/crear-post/crear-post.component';
import { PostService } from '../services/post.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, CrearPostComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  posts: any[] = [];
  cargando: boolean = true;
  cargandoMas: boolean = false;
  error: string = '';
  mensajeAccion: string = '';
  page: number = 1;
  totalPages: number = 1;
  comentarios: { [key: number]: any[] } = {};
  comentariosAbiertos: { [key: number]: boolean } = {};
  nuevoComentario: { [key: number]: string } = {};

  constructor(private postService: PostService, private cdr: ChangeDetectorRef) {}

  usuarioActual: any = null;
  
  ngOnInit() {
    const usuario = localStorage.getItem('usuario');
    if (usuario) this.usuarioActual = JSON.parse(usuario);
    this.cargarFeed();
  }

  cargarFeed() {
    this.page = 1;
    this.postService.obtenerFeed(this.page).subscribe({
      next: (res: any) => {
        this.posts = res.posts;
        this.totalPages = res.totalPages ?? 1;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Error al cargar el feed';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  cargarMas() {
    if (this.page >= this.totalPages || this.cargandoMas) return;
    this.cargandoMas = true;
    this.page++;
    this.postService.obtenerFeed(this.page).subscribe({
      next: (res: any) => {
        this.posts = [...this.posts, ...res.posts];
        this.totalPages = res.totalPages ?? 1;
        this.cargandoMas = false;
        this.cdr.detectChanges();
      },
      error: () => { this.cargandoMas = false; }
    });
  }

  votar(id_post: number, tipo: string) {
    this.postService.votar(id_post, tipo).subscribe({
      next: (res: any) => {
        console.log(res.mensaje);
        this.cargarFeed();
      },
      error: (err) => console.error('Error al votar:', err)
    });
  }

  toggleComentarios(id_post: number) {
    this.comentariosAbiertos[id_post] = !this.comentariosAbiertos[id_post];
    if (this.comentariosAbiertos[id_post]) {
      this.postService.obtenerComentarios(id_post).subscribe({
        next: (res: any) => {
          this.comentarios[id_post] = res.comentarios;
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Error al cargar comentarios:', err)
      });
    }
  }

  enviarComentario(id_post: number) {
    const contenido = this.nuevoComentario[id_post];
    if (!contenido || contenido.trim().length === 0) return;

    this.postService.crearComentario(id_post, contenido).subscribe({
      next: (res: any) => {
        this.nuevoComentario[id_post] = '';
        this.postService.obtenerComentarios(id_post).subscribe({
          next: (r: any) => {
            this.comentarios[id_post] = r.comentarios;
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => console.error('Error al comentar:', err)
    });
  }
  
  eliminarComentario(id_post: number, id_comentario: number) {
    if (!confirm('¿Eliminar este comentario?')) return;
    
    this.postService.eliminarComentario(id_post, id_comentario).subscribe({
      next: (res: any) => {
        this.postService.obtenerComentarios(id_post).subscribe({
          next: (r: any) => {
            this.comentarios[id_post] = r.comentarios;
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => console.error('Error al eliminar:', err)
    });
  }
  
  imgUrl(url: string): string {
    if (!url) return '';
    const backend = 'https://hipstagram-kevin.duckdns.org';
    if (url.startsWith('http')) {
      if (url.includes('s3.') || url.includes('amazonaws.com')) return url;
      try { return `${backend}${new URL(url).pathname}`; } catch { return url; }
    }
    return `${backend}${url}`;
  }

  puedeEliminar(post: any): boolean {
    if (!this.usuarioActual) return false;
    const esAutor = this.usuarioActual.username === post.username;
    const esAdmin = this.usuarioActual.rol === 'ADMIN';
    return esAutor || esAdmin;
  }
  
  eliminarPost(id_post: number) {
    if (!confirm('¿Estás seguro de eliminar este post?')) return;

    this.postService.eliminarPost(id_post).subscribe({
      next: () => {
        this.posts = this.posts.filter(p => p.id_post !== id_post);
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = err?.error?.mensaje || 'Error al eliminar el post. Intenta de nuevo.';
        this.mensajeAccion = msg;
        setTimeout(() => { this.mensajeAccion = ''; this.cdr.detectChanges(); }, 4000);
        this.cdr.detectChanges();
      }
    });
  }
}