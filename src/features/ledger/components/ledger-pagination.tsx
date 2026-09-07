import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

interface LedgerPaginationProps {
  pageIndex: number
  pageSize: number
  totalCount: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
}

const PAGE_SIZE_OPTIONS = [25, 50, 100]

const numberFormatter = new Intl.NumberFormat('es-CO')

export function LedgerPagination({
  pageIndex,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: LedgerPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))
  const firstRow = totalCount === 0 ? 0 : pageIndex * pageSize + 1
  const lastRow = Math.min((pageIndex + 1) * pageSize, totalCount)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-muted-foreground">
        {totalCount === 0
          ? 'Sin movimientos'
          : `${numberFormatter.format(firstRow)}–${numberFormatter.format(lastRow)} de ${numberFormatter.format(totalCount)}`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filas por página"
          className="h-9 w-auto"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} por página
            </option>
          ))}
        </Select>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={pageIndex === 0}
            onClick={() => onPageChange(pageIndex - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>

          <span className="px-2 text-sm tabular-nums text-muted-foreground">
            {pageIndex + 1} / {pageCount}
          </span>

          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={pageIndex + 1 >= pageCount}
            onClick={() => onPageChange(pageIndex + 1)}
            aria-label="Página siguiente"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
