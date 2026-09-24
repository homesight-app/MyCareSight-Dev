import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EditStaffModal from '@/components/EditStaffModal'
import { RateManagerModal } from '@/components/PayrollBillingReportContent'
import { getRateManagerDataAction } from '@/app/actions/payroll-billing-report'
import { savePatientServiceContractBillRatesAction } from '@/app/actions/payroll-billing-report'
import { saveCaregiverProfileAction, saveCaregiverPayRatesAction } from '@/app/actions/caregiver-pay-rates'

jest.mock('next/navigation',()=>({useRouter:()=>({refresh:jest.fn()})}))
jest.mock('@/app/actions/caregiver-pay-rates',()=>({saveCaregiverProfileAction:jest.fn(),saveCaregiverPayRatesAction:jest.fn()}))
jest.mock('@/app/actions/payroll-billing-report',()=>({getRateManagerDataAction:jest.fn(),getPayrollBillingReportRowsAction:jest.fn(),
  updatePatientServiceContractBillRateAction:jest.fn(),savePatientServiceContractBillRatesAction:jest.fn()}))
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}))

const staff={id:'50000000-0000-4000-8000-000000000001',first_name:'Synthetic',last_name:'Caregiver',
  email:'synthetic@example.invalid',role:'Home Health Aide',status:'active',currentPayRate:20}
beforeEach(()=>{jest.clearAllMocks()})

test('caregiver form disables native validation and rejects invalid precision inline',async ()=>{
  render(<EditStaffModal isOpen onClose={jest.fn()} staff={staff}/>)
  const submit=screen.getByRole('button',{name:'Update Caregiver'})
  expect(submit.closest('form')).toHaveAttribute('novalidate')
  fireEvent.change(screen.getByLabelText('Hourly pay'),{target:{value:'1.234'}})
  fireEvent.click(submit)
  expect(await screen.findByText('Enter a non-negative amount with at most two decimal places')).toBeInTheDocument()
  expect(saveCaregiverProfileAction).not.toHaveBeenCalled()
})

test('server field errors are displayed inline without closing the caregiver form',async ()=>{
  jest.mocked(saveCaregiverProfileAction).mockResolvedValue({success:false,fieldErrors:{email:['Synthetic server field error']}})
  const close=jest.fn()
  render(<EditStaffModal isOpen onClose={close} staff={staff}/>)
  fireEvent.click(screen.getByRole('button',{name:'Update Caregiver'}))
  expect(await screen.findByText('Synthetic server field error')).toBeInTheDocument()
  expect(close).not.toHaveBeenCalled()
  expect(saveCaregiverProfileAction).toHaveBeenCalledTimes(1)
})

test('profile and pay fields are sent through one combined server action',async ()=>{
  jest.mocked(saveCaregiverProfileAction).mockResolvedValue({success:true})
  const close=jest.fn()
  render(<EditStaffModal isOpen onClose={close} staff={staff}/>)
  fireEvent.change(screen.getByLabelText('Hourly pay'),{target:{value:'25.50'}})
  fireEvent.click(screen.getByRole('button',{name:'Update Caregiver'}))
  await waitFor(()=>expect(close).toHaveBeenCalledTimes(1))
  expect(saveCaregiverProfileAction).toHaveBeenCalledWith(staff.id,expect.objectContaining({
    first_name:'Synthetic',email:'synthetic@example.invalid',pay_rate_hourly:'25.50',
  }))
  expect(saveCaregiverProfileAction).toHaveBeenCalledTimes(1)
})


test('rate manager submits only changed rows, preserves units, and maps batch errors to the correct field',async ()=>{
  jest.mocked(getRateManagerDataAction).mockResolvedValue({payRows:[
    {id:'r1',caregiver_member_id:staff.id,caregiverName:'Synthetic One',service_type:null,rate:20,unit_type:'hour',effective_start:'2026-01-01',effective_end:null},
    {id:'r2',caregiver_member_id:'50000000-0000-4000-8000-000000000002',caregiverName:'Synthetic Two',service_type:'skilled',rate:30,unit_type:'visit',effective_start:'2026-01-01',effective_end:null},
  ],billRows:[]})
  jest.mocked(saveCaregiverPayRatesAction).mockResolvedValue({success:false,fieldErrors:{'rates.0.payRate':['Synthetic rate error']}})
  render(<RateManagerModal isOpen onClose={jest.fn()}/>)
  fireEvent.change(await screen.findByLabelText('Pay rate for Synthetic Two'),{target:{value:'35.50'}})
  fireEvent.click(screen.getAllByRole('button',{name:'Save Changes'})[0])
  expect(await screen.findByText('Synthetic rate error')).toBeInTheDocument()
  expect(saveCaregiverPayRatesAction).toHaveBeenCalledWith({rates:[expect.objectContaining({
    caregiverMemberId:'50000000-0000-4000-8000-000000000002',payRate:35.5,serviceType:'skilled',unitType:'visit',
  })]})
})

test('rate manager does not turn a blank pay amount into zero',async ()=>{
  jest.mocked(getRateManagerDataAction).mockResolvedValue({payRows:[
    {id:'r1',caregiver_member_id:staff.id,caregiverName:'Synthetic One',service_type:null,rate:20,unit_type:'hour',effective_start:'2026-01-01',effective_end:null},
  ],billRows:[]})
  render(<RateManagerModal isOpen onClose={jest.fn()}/>)
  fireEvent.change(await screen.findByLabelText('Pay rate for Synthetic One'),{target:{value:''}})
  fireEvent.click(screen.getAllByRole('button',{name:'Save Changes'})[0])
  expect(await screen.findByText('Enter a non-negative amount with at most two decimal places')).toBeInTheDocument()
  expect(saveCaregiverPayRatesAction).not.toHaveBeenCalled()
})

test('rate manager sends changed bill rates in one validated batch and rejects blank amounts',async ()=>{
  const first='50000000-0000-4000-8000-000000000011'
  const second='50000000-0000-4000-8000-000000000012'
  jest.mocked(getRateManagerDataAction).mockResolvedValue({payRows:[],billRows:[
    {id:first,patient_id:staff.id,clientName:'Synthetic Client One',contract_name:'One',contract_type:'hourly',service_type:'non_skilled',bill_rate:40,bill_unit_type:'hour',effective_date:'2026-01-01'},
    {id:second,patient_id:staff.id,clientName:'Synthetic Client Two',contract_name:'Two',contract_type:'hourly',service_type:'skilled',bill_rate:50,bill_unit_type:'hour',effective_date:'2026-01-01'},
  ]})
  jest.mocked(savePatientServiceContractBillRatesAction).mockResolvedValue({success:true})
  render(<RateManagerModal isOpen onClose={jest.fn()}/>)
  fireEvent.click(await screen.findByRole('tab',{name:'Client Bill Rates'}))
  fireEvent.change(screen.getByLabelText('Bill rate for Synthetic Client One'),{target:{value:'41.25'}})
  fireEvent.change(screen.getByLabelText('Bill rate for Synthetic Client Two'),{target:{value:'51.75'}})
  fireEvent.click(screen.getAllByRole('button',{name:'Save Changes'})[0])
  await waitFor(()=>expect(savePatientServiceContractBillRatesAction).toHaveBeenCalledWith({rates:[
    {contractId:first,billRate:41.25},{contractId:second,billRate:51.75},
  ]}))
  jest.clearAllMocks()
  fireEvent.change(screen.getByLabelText('Bill rate for Synthetic Client One'),{target:{value:''}})
  fireEvent.click(screen.getAllByRole('button',{name:'Save Changes'})[0])
  expect(await screen.findByText('Bill rate must be a number')).toBeInTheDocument()
  expect(savePatientServiceContractBillRatesAction).not.toHaveBeenCalled()
})
