import { EventEmitter } from 'events';

type EventEmitterLike = EventEmitter & {
  handlers?: { [id: string]: Function };
};

/** Designates a function as an event handler for a specified event. */
export function on(id: string): MethodDecorator {
  return function<T extends EventEmitterLike>(
    target: T,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    if (!target.handlers) target.handlers = {};

    target.handlers[id] = descriptor.value;
  };
}

/** Registers all event handler functions designated with `@message` on object creation. */
export function registerEvents<
T extends { handlers?: { [id: string]: Function }; new(...args: any[]) }
>(constructor: T) {
  return class extends constructor {
    constructor(...args: any[]) {
      super(...args);
      for (const id in constructor.prototype.handlers) {
        this.on(id, constructor.prototype.handlers[id]);
      }
    }
  };
}
