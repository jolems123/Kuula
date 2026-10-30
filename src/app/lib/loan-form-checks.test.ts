import { expect, it } from "vitest";
import { checkLoanForm } from "./loan-form-checks";
import type { BusinessDetails } from "../api/types";
const business = { businessName:"Shop",applicantPosition:"Owner",sector:"Retail",district:"Wakiso",physicalAddress:"Market road",goodsOrServices:"Groceries",tradingAs:"informal",registrationNumber:"",tradingMonths:12,staffCount:0,useOfFunds:{stock:0,equipment:0,operations:0,expansion:0,other:0},inventoryCost:0,rentCost:0,wagesCost:0,otherOperatingCosts:0,lowSeasonMonthlySales:0,salesFrequency:"unknown",expenditureItems:[],guarantors:[{name:"Amina",phone:"0701234567"},{name:"Moses",phone:"0701234568"}] } as unknown as BusinessDetails;
const good = {amount:500000,term:90,purposes:["Working capital"],otherPurpose:"",business,income:2000000,expenses:500000,debt:0,photos:{exterior:true,interior:true,applicant_at_business:true},consent:true,identityApproved:true};
it("allows a complete application without optional statements or line items",()=>expect(checkLoanForm(good)).toEqual([]));
it("lists every missing answer with an exact navigation target",()=>{
  const issues=checkLoanForm({...good,identityApproved:false,purposes:[],business:{...business,businessName:"",guarantors:[]},photos:{},consent:false,income:0});
  for(const target of ["loan-identity","loan-purposes","loan-businessName","loan-photos","loan-photo-consent","loan-income","loan-guarantors"]) expect(issues.some(issue=>issue.target===target)).toBe(true);
  expect(issues.map(issue=>issue.message).join(" ")).not.toContain("businessName");
});
it("checks whole UGX, Other description, affordability and guarantor details",()=>{
  const issues=checkLoanForm({...good,amount:1.5,purposes:["Other"],debt:2000000,business:{...business,guarantors:[{name:"",phone:"bad"},{name:"Moses",phone:"0701234568"}]}});
  for(const target of ["loan-amount","loan-other-purpose","loan-finances","loan-guarantor-1-name","loan-guarantor-1-phone"]) expect(issues.some(issue=>issue.target===target)).toBe(true);
});
