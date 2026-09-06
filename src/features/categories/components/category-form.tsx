import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { IconPicker } from '@/components/ui/icon-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  categorySchema,
  categoryTypeOptions,
  type CategoryFormValues,
} from '@/features/categories/schemas'

interface CategoryFormProps {
  defaultValues?: Partial<CategoryFormValues>
  onSubmit: (values: CategoryFormValues) => void | Promise<void>
  submitLabel?: string
  isSubmitting?: boolean
}

export function CategoryForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Guardar',
  isSubmitting,
}: CategoryFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    mode: 'onBlur',
    defaultValues: {
      type: 'expense',
      icon: 'more-horizontal',
      color: '#E83E8C',
      ...defaultValues,
    },
  })

  const icon = watch('icon')
  const color = watch('color')

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="category-name">Nombre</Label>
        <Input
          id="category-name"
          placeholder="Ej. Mercado"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'category-name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="category-name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="category-type">Tipo</Label>
        <Select id="category-type" {...register('type')}>
          {categoryTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Ícono</span>
        <IconPicker value={icon} onChange={(value) => setValue('icon', value, { shouldValidate: true })} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Color</span>
        <ColorPicker value={color} onChange={(value) => setValue('color', value, { shouldValidate: true })} />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
