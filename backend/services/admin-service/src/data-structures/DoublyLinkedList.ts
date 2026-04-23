export class DLLNode<T> {
    public data: T;
    public prev: DLLNode<T> | null = null;
    public next: DLLNode<T> | null = null;

    constructor(data: T) {
      this.data = data;
    }
  }

  export class DoublyLinkedList<T> {
    private head: DLLNode<T> | null = null;
    private tail: DLLNode<T> | null = null;
    private _size: number = 0;

    get size(): number {
      return this._size;
    }

    append(data: T): DLLNode<T> {
      const node = new DLLNode(data);

      if (!this.tail) {
        this.head = node;
        this.tail = node;
      } else {
        node.prev = this.tail;
        this.tail.next = node;
        this.tail = node;
      }

      this._size++;
      return node;
    }

    prepend(data: T): DLLNode<T> {
      const node = new DLLNode(data);

      if (!this.head) {
        this.head = node;
        this.tail = node;
      } else {
        node.next = this.head;
        this.head.prev = node;
        this.head = node;
      }

      this._size++;
      return node;
    }

    remove(node: DLLNode<T>): void {
      if (node.prev) {
        node.prev.next = node.next;
      } else {
        this.head = node.next;
      }

      if (node.next) {
        node.next.prev = node.prev;
      } else {
        this.tail = node.prev;
      }

      node.prev = null;
      node.next = null;
      this._size--;
    }

    toArray(): T[] {
      const result: T[] = [];
      let current = this.head;
      while (current) {
        result.push(current.data);
        current = current.next;
      }
      return result;
    }

    toArrayReversed(): T[] {
      const result: T[] = [];
      let current = this.tail;
      while (current) {
        result.push(current.data);
        current = current.prev;
      }
      return result;
    }

    paginate(page: number, pageSize: number): { data: T[]; total: number; totalPages: number } {
      const all = this.toArrayReversed();
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      return {
        data: all.slice(start, end),
        total: this._size,
        totalPages: Math.ceil(this._size / pageSize),
      };
    }

    clear(): void {
      this.head = null;
      this.tail = null;
      this._size = 0;
    }

    filter(predicate: (data: T) => boolean): T[] {
      const result: T[] = [];
      let current = this.head;
      while (current) {
        if (predicate(current.data)) result.push(current.data);
        current = current.next;
      }
      return result;
    }

    getHead(): DLLNode<T> | null {
      return this.head;
    }

    getTail(): DLLNode<T> | null {
      return this.tail;
    }
  }
