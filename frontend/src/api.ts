export const api = {
 async request(method:string, url:string, body?:unknown) {
  const token = sessionStorage.getItem('claims-token');
  const response = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5050') + url, {method, headers: {...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body && !(body instanceof FormData) ? {'Content-Type':'application/json'} : {})}, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined});
  const data = response.status === 204 ? null : await response.json();
  if (response.status===401 && token) { sessionStorage.removeItem('claims-token'); location.reload(); }
  if (!response.ok) throw {response:{data}, message:data?.error}; return {data};
 }, get(url:string){return this.request('GET',url)}, post(url:string,body?:unknown){return this.request('POST',url,body)}, patch(url:string,body:unknown){return this.request('PATCH',url,body)}, delete(url:string){return this.request('DELETE',url)}
};
