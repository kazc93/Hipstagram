// Servicio de posts — centraliza todas las llamadas HTTP al API de posts, votos,
// comentarios y búsqueda. El interceptor agrega el token JWT automáticamente.
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PostService {
  private URL      = 'https://hipstagram-kevin.duckdns.org/api/posts';
  private BUSQUEDA = 'https://hipstagram-kevin.duckdns.org/api/busqueda';

  constructor(private http: HttpClient) {}

  // Obtener el feed paginado ordenado por likes (solo posts PUBLICADO)
  obtenerFeed(page = 1, limit = 10): Observable<any> {
    return this.http.get(`${this.URL}/feed?page=${page}&limit=${limit}`);
  }

  // Obtener todos los posts del usuario autenticado (incluye BLOQUEADO/PENDIENTE)
  obtenerMisPosts(): Observable<any> {
    return this.http.get(`${this.URL}/mis-posts`);
  }

  // Enviar un nuevo post (FormData con imagen + descripción + hashtags)
  crearPost(post: any): Observable<any> {
    return this.http.post(this.URL, post);
  }

  // Votar en un post — tipo: 'like' | 'dislike'
  // Si ya votó igual → cancela; si votó diferente → cambia reacción
  votar(id_post: number, tipo: string): Observable<any> {
    return this.http.post(`${this.URL}/${id_post}/votar`, { tipo });
  }

  // Obtener comentarios de un post con paginación
  obtenerComentarios(id_post: number, page = 1): Observable<any> {
    return this.http.get(`${this.URL}/${id_post}/comentarios?page=${page}`);
  }

  // Publicar un comentario en un post
  crearComentario(id_post: number, contenido: string): Observable<any> {
    return this.http.post(`${this.URL}/${id_post}/comentarios`, { contenido });
  }

  // Eliminar un comentario propio
  eliminarComentario(id_post: number, id_comentario: number): Observable<any> {
    return this.http.delete(`${this.URL}/${id_post}/comentarios/${id_comentario}`);
  }

  // Eliminar un post propio (retorna 409 si tiene votos/comentarios)
  eliminarPost(id_post: number): Observable<any> {
    return this.http.delete(`${this.URL}/${id_post}`);
  }

  // Buscar posts que contengan un hashtag específico
  buscarPorHashtag(tag: string, page = 1): Observable<any> {
    return this.http.get(`${this.BUSQUEDA}/hashtag?tag=${encodeURIComponent(tag)}&page=${page}`);
  }

  // Buscar posts por texto libre (en descripción o nombre de hashtag)
  buscarGeneral(q: string, page = 1): Observable<any> {
    return this.http.get(`${this.BUSQUEDA}/general?q=${encodeURIComponent(q)}&page=${page}`);
  }

  // Explorar posts más populares (con likes, ordenados DESC)
  explorar(page = 1): Observable<any> {
    return this.http.get(`${this.BUSQUEDA}/explorar?page=${page}`);
  }
}
