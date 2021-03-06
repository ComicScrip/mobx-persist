import {reaction, action, IReactionDisposer} from 'mobx'
import {
    serialize, deserialize,
    update,
    serializable, getDefaultModelSchema
} from 'serializr'
import * as Storage from './storage'
import { mergeObservables } from './merge-x'
import { types, Types } from './types'
import { persistObject } from './persist-object'

export function persist(type: Types, schema?: any): (target: Object, key: string, baseDescriptor?: PropertyDescriptor) => void // two
export function persist(target: Object, key: string, baseDescriptor?: PropertyDescriptor): void // method decorator
export function persist(schema: Object): <T>(target: T) => T // object
export function persist(...args: any[]): any {
    const [a, b, c] = args
    const constructor = a.constructor as any

    if (constructor) {
      if(!constructor._persistedProps) {
        constructor._persistedProps = []
      }
      constructor._persistedProps.push(b)
    }

    if (a in types) {
        return serializable(types[a](b))
    } else if (args.length === 1) {
        return (target: any) => persistObject(target, a)
    } else {
        return serializable.apply(null, args)
    }
}

export interface optionsType {
    storage?: any
    jsonify?: boolean
    debounce?: number
}

export interface IHydrateResult<T> extends Promise<T> {
    rehydrate: () => IHydrateResult<T>,
    hydrationDisposer: IReactionDisposer
}

export function create({
    storage = Storage as any,
    jsonify = true,
    debounce = 0
}: any = {}) {
    if (typeof localStorage !== 'undefined' && localStorage === storage) storage = Storage
    return function hydrate<T extends Object>(key: string, store: T, persistKey: string = '', initialState: any = {}, customArgs: any = {}): IHydrateResult<T> {
      const schema = getDefaultModelSchema(store as any)
      const _persistKey = persistKey === '' ? key : persistKey

      function hydration() {
            const promise: IHydrateResult<T> = storage.getItem(_persistKey)
            .then((d: any) => !jsonify ? d : JSON.parse(d))
            .then(action(
                `[mobx-persist ${key}] LOAD_DATA`,
                (persisted: any) => {
                    if (persisted && typeof persisted === 'object') {
                        update(schema, store, persisted, null, customArgs)
                    }
                    mergeObservables(store, initialState)
                    return store
                }
            ))
            promise.rehydrate = hydration
            return promise
        }
        const result = hydration()
        result.hydrationDisposer = reaction(
            () => serialize(schema, store),
            (data: any) => storage.setItem(_persistKey, !jsonify ? data : JSON.stringify(data)),
            {
                delay: debounce
            }
        )
        return result
    }
}

