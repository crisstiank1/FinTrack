import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo electrónico').email('Correo electrónico inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    email: z.string().min(1, 'Ingresa tu correo electrónico').email('Correo electrónico inválido'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
export type RegisterValues = z.infer<typeof registerSchema>

export const requestResetSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo electrónico').email('Correo electrónico inválido'),
})
export type RequestResetValues = z.infer<typeof requestResetSchema>

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
export type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>
