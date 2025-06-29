export const arrayFromAsync = async <T>(gen: AsyncGenerator<T>): Promise<T[]> => {
 const arr: T[] =  []
 for await (const el of gen) {
    arr.push(el)
 }
 return arr
}